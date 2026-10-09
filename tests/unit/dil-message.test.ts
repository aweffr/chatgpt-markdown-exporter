import { describe, expect, it } from "vitest";
import { apiMessageFromNode } from "../../src/api-message";
import { completeConversationFromPayload } from "../../src/conversation";
import { renderMarkdown } from "../../src/markdown";
import { extractVisibleConversation } from "../../src/dom-extractor";
import {
  chartMarker,
  cite,
  dilNode,
  filecite,
  richDilNode,
  imageGroupMarker,
  unsupportedDilNode,
} from "../fixtures/dil/message";

describe("DIL message export", () => {
  it("supports arbitrary new marker names and non-JSON arguments without component metadata", () => {
    const node = dilNode("Before\n\n\uE200new_component\uE202plain text\uE2020\uE201\n\nAfter");
    const message = apiMessageFromNode(node)!;
    const block = message.markdown.match(/```json\n([\s\S]*?)\n```/u)!;
    expect(JSON.parse(block[1]!)).toEqual({type: "new_component", arguments: ["plain text", 0]});
    expect(message.markdown).toContain("After");
  });
  it("preserves unsupported image parameters and API results without losing prose or citations", () => {
    const message = apiMessageFromNode(unsupportedDilNode())!;
    const output = renderMarkdown("Fixture", [message], new Set([message.id]));
    expect(output).toContain("Before[^1]");
    expect(output).toContain("After[^2]");
    expect(output.indexOf("Before")).toBeLessThan(output.indexOf("原始组件：image_group"));
    expect(output.indexOf("原始组件：image_group")).toBeLessThan(output.indexOf("After"));
    const blocks = [...output.matchAll(/```json\n([\s\S]*?)\n```/gu)].map((block) => JSON.parse(block[1]!));
    expect(blocks[0]).toEqual({
      type: "image_group",
      arguments: [{query: ["industrial storage"], layout: "carousel", num_per_query: 1}],
    });
    expect(blocks[1]["photo-component"].state.images[0]).toEqual({
      title: "Storage tanks", url: "https://example.com/storage",
      content_url: "https://example.com/full-image.png",
      original_content_url: "https://example.com/original.jpg",
    });
    expect(blocks[1]["citation-component"]).toBeUndefined();
  });
  it("preserves unsupported widget reference data instead of failing the conversation", () => {
    const marker = '\uE200genui\uE202{"custom_widget":{"id":"demo"}}\uE201';
    const node = dilNode(`Before\n\n${marker}\n\nAfter${cite("turn0search0")}`);
    const reference = {matched_text: marker, data: {widget_type: "custom_widget", content: {label: "Example", values: [0, -2]}}};
    node.message!.metadata!.content_references = [reference];
    const message = apiMessageFromNode(node)!;
    const blocks = [...message.markdown.matchAll(/```json\n([\s\S]*?)\n```/gu)].map((block) => JSON.parse(block[1]!));
    expect(blocks[0].reference).toEqual(reference);
    expect(message.citations).toHaveLength(1);
  });
  it("keeps unknown component data literal and excludes it when its message is deselected", () => {
    const literal = {html: '<svg><text>Raw text</text></svg>', math: '\\(raw\\)', code: '```', marker: cite("missing")};
    const encoded = JSON.stringify(literal).replace(/[\uE200-\uE202]/gu, (character) => `\\u${character.charCodeAt(0).toString(16)}`);
    const node = dilNode(`Before\n\n\uE200future_component\uE202${encoded}\uE201\n\nAfter`);
    const raw = apiMessageFromNode(node)!;
    const blocks = [...raw.markdown.matchAll(/```json\n([\s\S]*?)\n```/gu)].map((block) => JSON.parse(block[1]!));
    expect(blocks[0].arguments).toEqual([literal]);
    const normal = apiMessageFromNode(dilNode("Normal answer"))!;
    normal.id = "normal";
    const selected = renderMarkdown("Fixture", [raw, normal], new Set([normal.id]));
    expect(selected).toContain("Normal answer");
    expect(selected).not.toContain("future_component");
  });
  it("preserves literal unknown markers in code without appending raw component data", () => {
    const node = unsupportedDilNode();
    const dil = node.message!.metadata!.model_dil_v2 as {fallbackMarkdown: string};
    dil.fallbackMarkdown = `Example \`${imageGroupMarker}\`\n\n\`\`\`text\n${imageGroupMarker}\n\`\`\``;
    const message = apiMessageFromNode(node)!;
    expect(message.markdown).toContain(imageGroupMarker);
    expect(message.markdown).not.toContain("组件原始数据");
    expect(message.markdown).not.toContain("Storage tanks");
  });
  it("converts SVG figures whose raw JSX has expression attributes", () => {
    const node = dilNode(
      '```svg\n<svg><text stroke-width="2">Value: 0</text></svg>\n```',
    );
    node.message!.content!.parts = [
      '<svg><text strokeWidth={2}>Value: 0</text></svg>',
    ];
    expect(apiMessageFromNode(node)?.markdown).toBe("Value: 0");
  });
  it("does not erase textless SVG code examples when a textless figure exists", () => {
    const example = '```svg\n<svg><circle r="5"/></svg>\n```';
    const node = dilNode(`Figure\n\n${example}`);
    node.message!.content!.parts = ['<svg><rect width="10"/></svg>'];
    expect(apiMessageFromNode(node)?.markdown).toContain(example);
  });
  it("converts sources after escaped backticks and across paragraph boundaries", () => {
    const url = "\uE200url\uE202News\uE202https://example.com/news\uE201";
    for (const prefix of ["Press \\` to switch. ", "Press \\` to switch.\n\n", "An unmatched ` here.\n\n"]) {
      const node = dilNode(
        `${prefix}Conclusion ${url}${cite("turn0search0")}, then \`code\`.`,
      );
      const message = apiMessageFromNode(node)!;
      expect(message.markdown).toContain("[News](https://example.com/news)");
      expect(message.markdown).toContain("`code`");
      expect(message.citations).toHaveLength(1);
      expect(message.markdown).not.toMatch(/[\uE200-\uE202]/u);
    }
  });
  it("respects even backslashes before code and escaped backticks inside code", () => {
    const marker = cite("turn0search0");
    const node = dilNode('Code \\\\`' + marker + '\\` and prose ' + marker + '.');
    const message = apiMessageFromNode(node)!;
    expect(message.markdown).toContain("`" + marker + "\\`");
    expect(message.citations).toHaveLength(1);
  });
  it("preserves multiline inline code within one paragraph", () => {
    const literal = `\`\`${cite("missing")}\n\`single tick\` \`\``;
    const message = apiMessageFromNode(dilNode(`${literal} then ${cite("turn0search0")}`))!;
    expect(message.markdown).toContain(literal);
    expect(message.citations).toHaveLength(1);
  });
  it("renders sources with null titles using the hostname", () => {
    const message = apiMessageFromNode(
      dilNode(`Body${cite("turn0search0")}`, null),
    )!;
    expect(
      renderMarkdown("Fixture", [message], new Set([message.id])),
    ).toContain("[^1]: [example.com](https://example.com/a)");
  });
  it("converts explicit URL markers to links without moving them into footnotes", () => {
    const url =
      "\uE200url\uE202Official announcement\uE202https://example.com/news\uE201";
    const message = apiMessageFromNode(
      dilNode(`Before ${url} after${cite("turn0search0")}.\n\n\`${url}\``),
    )!;
    expect(message.markdown).toContain(
      "Before [Official announcement](https://example.com/news) after",
    );
    expect(message.markdown).toContain(`\`${url}\``);
    expect(message.citations).toHaveLength(1);
  });
  it("preserves the readable entity name while leaving entity code examples literal", () => {
    const entity = '\uE200entity\uE202["company","Example Company"]\uE201';
    const message = apiMessageFromNode(
      dilNode(`Company ${entity}.\n\n\`${entity}\``),
    );
    expect(message?.markdown).toBe(`Company Example Company.\n\n\`${entity}\``);
  });
  it("renumbers only selected DIL citations and reuses the same canonical URL", () => {
    const omitted = apiMessageFromNode(
      dilNode(`Omitted${cite("turn0search0")}`),
    )!;
    const selected = apiMessageFromNode(
      dilNode(`Selected${cite("turn0search1")}`),
    )!;
    selected.id = "selected-answer";
    const repeated = {
      ...selected,
      id: "repeated-answer",
      citations: [
        {
          title: "Same source",
          url: "https://example.com/b?utm_source=chatgpt.com#section",
        },
      ],
    };
    const output = renderMarkdown(
      "Fixture",
      [omitted, selected, repeated],
      new Set([selected.id, repeated.id]),
    );
    expect(output.match(/Selected\[\^1\]/gu)).toHaveLength(2);
    expect(output).toContain("[^1]: [Source B](https://example.com/b)");
    expect(output).not.toMatch(/Omitted|Source A|\[\^2\]/u);
  });
  it("converts renderer-generated SVG fences while keeping SVG code examples literal", () => {
    const svg = '<svg><text font-size="11">Value: 0</text></svg>';
    const fence = `\`\`\`svg\n${svg}\n\`\`\``;
    const node = dilNode(`Before\n\n${fence}\n\nAfter`);
    node.message!.content!.parts = [
      '<box><svg>\n  <text fontSize="11">Value: 0</text>\n</svg></box>',
    ];
    expect(apiMessageFromNode(node)?.markdown).toBe(
      "Before\n\nValue: 0\n\nAfter",
    );
    node.message!.content!.parts = [`Example\n\n${fence}`];
    expect(apiMessageFromNode(node)?.markdown).toContain(fence);
  });
  it("keeps visible supplements and model evidence without replacing or duplicating the canonical body", () => {
    document.body.innerHTML = `<div data-chatgpt-search-message-ids="dil-answer" data-message-model-slug="gpt-6-thinking">
      <div data-export-targeted-reply>Earlier answer</div>
      <div data-export-reasoning-summary>Checked the sources</div>
      <div data-chatgpt-selection-message-id="dil-answer" data-markdown-text-style="assistant-message"><p>Incomplete DOM body</p></div>
    </div>`;
    const node = dilNode("Canonical body");
    delete node.message!.metadata!.model_slug;
    node.message!.metadata!.targetedReply = "Earlier answer";
    const result = completeConversationFromPayload(
      {
        current_node: "dil-answer",
        mapping: { "dil-answer": { ...node, parent: null } },
      },
      extractVisibleConversation(document),
      { visibleMessageIds: ["dil-answer"], visibleTurnIds: [] },
    );
    expect(result.messages[0]?.markdown).toContain(
      "> **思考摘要**\n>\n> Checked the sources",
    );
    expect(result.messages[0]?.markdown).toContain("Canonical body");
    expect(result.messages[0]?.markdown.match(/Earlier answer/gu)).toHaveLength(
      1,
    );
    expect(result.messages[0]?.markdown).not.toContain("Incomplete DOM body");
    expect(result.messages[0]?.model).toBe("gpt-6-thinking");
  });
  it("uses formatted chart values without doubling units or dropping raw cells", () => {
    const node = richDilNode();
    const reference = (
      node.message!.metadata!.content_references as Array<{
        data: { content: { data: unknown[]; formattedData?: unknown[] } };
      }>
    )[0]!;
    reference.data.content.data = [
      { quarter: "Q1", ratio: 3.7000000000000004, count: 0 },
    ];
    reference.data.content.formattedData = [
      { quarter: "First quarter", ratio: "3.7%" },
    ];
    expect(apiMessageFromNode(node)?.markdown).toContain(
      "| First quarter | 3.7% | 0 |",
    );
  });
  it("preserves formulas, chart data, SVG labels and resource links in reading order", () => {
    const message = apiMessageFromNode(richDilNode())!;
    const output = renderMarkdown("Fixture", [message], new Set([message.id]));
    expect(output).toContain("Inline $Y=C+I+G$.");
    expect(output).toContain("$$\nS-I=CA\n$$");
    expect(output).toContain("Trend\n\nQuarterly values");
    expect(output).toContain("| quarter | Ratio | Count |");
    expect(output).toContain("| Q1 | 0% | 5 |");
    expect(output).toContain("| Q2 | -2% |  |");
    expect(output.indexOf("Trend")).toBeLessThan(output.indexOf("Comparison"));
    expect(output).toContain("Comparison\nTwo values\nA: 0%\nB: -2%");
    expect(output).toContain("![Picture](https://example.com/image.png)");
    expect(output).toContain("[Attachment](https://example.com/report.pdf)");
    expect(output).not.toMatch(/<svg|<rect|genui|charts_widget_v2/u);
  });

  it("does not convert citation, math or SVG literals in fenced and inline code", () => {
    const literal = `${cite("missing")} \\(code\\) <svg><text>literal</text></svg>`;
    const body = `Before${cite("turn0search0")}\n\n~~~text\n${literal}\n~~~~\n\n\`\`${literal}\`\` then \\(real\\).`;
    const message = apiMessageFromNode(dilNode(body));
    expect(message?.markdown).toContain(`~~~text\n${literal}\n~~~~`);
    expect(message?.markdown).toContain(`\`\`${literal}\`\` then $real$.`);
    expect(message?.citations).toHaveLength(1);
  });

  it("preserves chart parameters and references as raw data when they cannot be converted", () => {
    const missing = apiMessageFromNode(dilNode(`Before ${chartMarker} after`))!;
    expect(missing.markdown).toContain("原始组件：genui");
    expect(missing.markdown).toContain('"charts_widget_v2"');
    const node = richDilNode();
    const reference = (
      node.message!.metadata!.content_references as Array<{
        data: { content: { data: unknown[] } };
      }>
    )[0]!;
    reference.data.content.data = [];
    expect(apiMessageFromNode(node)?.markdown).toContain('"data": []');
  });

  it("outputs file links when the source supplies an actual URL", () => {
    const node = dilNode(filecite("turn0file0"));
    const dil = node.message!.metadata!.model_dil_v2 as {
      appData: {
        opGenui: {
          componentResults: Record<
            string,
            { state: { safe_file_url: string | null } }
          >;
        };
      };
    };
    dil.appData.opGenui.componentResults[
      "file-component"
    ]!.state.safe_file_url = "https://example.com/report.txt";
    expect(apiMessageFromNode(node)?.markdown).toBe(
      "[report.txt](https://example.com/report.txt)",
    );
  });
  it("uses fallback body and resolves grouped/repeated citations at their original positions", () => {
    const node = dilNode(
      `First${cite("turn0search0\uE202turn0search1")} then again${cite("turn0search0")} end.`,
    );
    const message = apiMessageFromNode(node)!;
    const output = renderMarkdown("Fixture", [message], new Set([message.id]));
    expect(output).toContain("First[^1] [^2] then again[^1] end.");
    expect(output).toContain("[^1]: [Source A](https://example.com/a)");
    expect(output).toContain("[^2]: [Source B](https://example.com/b)");
    expect(output).not.toContain("Raw");
    expect(output).not.toContain("<Cite");
  });

  it("keeps the canonical DIL body and citations independent of DOM mounting without extra preambles", () => {
    const node = dilNode(`Actual body${cite("turn0search0")}`);
    const payload = {
      current_node: "dil-answer",
      mapping: { "dil-answer": { ...node, parent: null } },
    };
    const hints = { visibleMessageIds: ["dil-answer"], visibleTurnIds: [] };
    const mounted = completeConversationFromPayload(
      payload,
      {
        title: "Fixture",
        messages: [
          {
            id: "dil-answer",
            role: "assistant",
            markdown: "Incomplete DOM body",
            citations: [],
          },
        ],
      },
      hints,
    );
    const unmounted = completeConversationFromPayload(
      payload,
      { title: "Fixture", messages: [] },
      hints,
    );
    expect(mounted.messages).toEqual(unmounted.messages);
    expect(mounted.messages[0]?.markdown).toContain("Actual body");
  });

  it("preserves file names and line ranges without inventing URLs", () => {
    const message = apiMessageFromNode(
      dilNode(`File ${filecite("turn0file0", "L27-L29")}`),
    );
    expect(message?.markdown).toBe("File [附件：report.txt]（L27-L29）");
  });

  it("fails explicitly when a required citation or fallback body cannot be resolved", () => {
    expect(() => apiMessageFromNode(dilNode(cite("missing")))).toThrow();
    const node = dilNode("");
    expect(() => apiMessageFromNode(node)).toThrow();
  });
});
