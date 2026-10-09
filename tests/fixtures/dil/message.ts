import type { ConversationNode } from "../../../src/types";

export const cite = (refs: string): string => `\uE200cite\uE202${refs}\uE201`;
export const filecite = (ref: string, lines = ""): string =>
  `\uE200filecite\uE202${ref}${lines ? `\uE202${lines}` : ""}\uE201`;

export function dilNode(
  body: string,
  sourceTitle: string | null = "Source A",
): ConversationNode {
  return {
    id: "dil-answer",
    parent: "question",
    children: [],
    message: {
      id: "dil-answer",
      author: { role: "assistant" },
      recipient: "all",
      channel: "final",
      content: {
        content_type: "text",
        parts: ['Raw <Cite ref="turn0search0"/>'],
      },
      metadata: {
        model_slug: "gpt-6-thinking",
        model_dil_v2: {
          fallbackMarkdownVersion: 1,
          fallbackMarkdown: body,
          code: "throw new Error('DIL code must never execute')",
          appData: {
            opGenui: {
              componentResults: {
                // Component identity is deliberately different from its source IDs.
                "citation-component": {
                  status: "resolved",
                  componentName: "Cite",
                  state: {
                    items: [
                      {
                        ref_id: "turn0search0",
                        title: sourceTitle,
                        url: "https://example.com/a",
                      },
                      {
                        ref_id: "turn0search1",
                        title: "Source B",
                        url: "https://example.com/b",
                      },
                      {
                        ref_id: "turn0search2",
                        title: null,
                        url: "https://example.com/untitled",
                      },
                    ],
                  },
                },
                "file-component": {
                  status: "resolved",
                  componentName: "FileCite",
                  state: {
                    refid: "turn0file0",
                    file_name: "report.txt",
                    safe_file_url: null,
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

export const chartMarker =
  '\uE200genui\uE202{"charts_widget_v2":{"fixture":true}}\uE201';

export const imageGroupMarker =
  '\uE200image_group\uE202{"query":["industrial storage"],"layout":"carousel","num_per_query":1}\uE201';

export function unsupportedDilNode(): ConversationNode {
  const node = dilNode(
    `Before${cite("turn0search0")}\n\n${imageGroupMarker}\n\nAfter${cite("turn0search1")}`,
  );
  const dil = node.message!.metadata!.model_dil_v2 as {
    appData: { opGenui: { componentResults: Record<string, unknown> } };
  };
  dil.appData.opGenui.componentResults["photo-component"] = {
    status: "resolved",
    componentName: "AsyncImage",
    state: {
      images: [{
        title: "Storage tanks",
        url: "https://example.com/storage",
        content_url: "https://example.com/full-image.png",
        original_content_url: "https://example.com/original.jpg",
      }],
    },
  };
  return node;
}

export function richDilNode(): ConversationNode {
  const svg =
    '<svg><title>Comparison</title><desc>Two values</desc><rect width="10"/><text>A: 0%</text><text>B: -2%</text></svg>';
  const node = dilNode(
    [
      `## Analysis\n\nBody${cite("turn0search0")}\n\nUntitled source${cite("turn0search2")}\n\nCompany \uE200entity\uE202["company","Example Company"]\uE201.`,
      "Inline \\(Y=C+I+G\\).\n\n\\[\nS-I=CA\n\\]",
      chartMarker,
      `\`\`\`svg\n${svg}\n\`\`\``,
      `File ${filecite("turn0file0", "L1-L3")}`,
      "![Picture](https://example.com/image.png)\n[Attachment](https://example.com/report.pdf)",
      "Press \\` to switch. \uE200url\uE202Official announcement\uE202https://example.com/news\uE201, then `code`.",
    ].join("\n\n"),
  );
  node.message!.content!.parts = [
    `<box>${svg.replace("<text>", "<text fontSize={12}>")}</box>`,
  ];
  node.message!.metadata!.content_references = [
    {
      type: "client_defined_widget",
      category: "visualization",
      matched_text: chartMarker,
      data: {
        language: "recharts-json",
        widget_type: "charts_widget_v2",
        content: {
          chartType: "line",
          meta: { title: "Trend", description: "Quarterly values" },
          xKey: "quarter",
          series: [
            { dataKey: "ratio", label: "Ratio", valueSuffix: "%" },
            { dataKey: "count", label: "Count" },
          ],
          data: [
            { quarter: "Q1", ratio: 0, count: 5 },
            { quarter: "Q2", ratio: -2, count: null },
          ],
          formattedData: [
            { quarter: "Q1", ratio: "0%", count: "5" },
            { quarter: "Q2", ratio: "-2%", count: "" },
          ],
        },
      },
    },
  ];
  return node;
}
