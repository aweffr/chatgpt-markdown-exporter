import { describe, expect, it } from "vitest";

import { extractVisibleConversation } from "../../src/dom-extractor";

describe("extractVisibleConversation", () => {
  it("extracts identified visible messages and rich Markdown", () => {
    document.body.innerHTML = `
      <main>
        <div data-message-id="u1" data-message-author-role="user">
          <div class="whitespace-pre-wrap">Hello <strong>world</strong></div>
        </div>
        <div data-message-id="a1" data-message-author-role="assistant" data-message-model-slug="gpt-5-6-thinking">
          <div class="markdown">
            <h3>Result</h3>
            <p>See <span data-testid="webpage-citation-pill"><a href="https://example.com/source?utm_source=chatgpt.com"><span>Example title</span></a></span>.</p>
            <pre><code class="language-ts">const n = 1;</code></pre>
            <table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
            <img alt="plot" src="https://example.com/plot.png">
            <a href="https://example.com/file.pdf">report.pdf</a>
          </div>
        </div>
      </main>`;

    const result = extractVisibleConversation(document);
    expect(result.messages.map((message) => message.id)).toEqual(["u1", "a1"]);
    expect(result.messages[0]?.markdown).toContain("Hello **world**");
    expect(result.messages[1]?.model).toBe("gpt-5-6-thinking");
    expect(result.messages[1]?.markdown).toContain("### Result");
    expect(result.messages[1]?.markdown).toContain("```ts\nconst n = 1;\n```");
    expect(result.messages[1]?.markdown).toContain("| A | B |");
    expect(result.messages[1]?.markdown).toContain(
      "![plot](https://example.com/plot.png)",
    );
    expect(result.messages[1]?.markdown).toContain(
      "[report.pdf](https://example.com/file.pdf)",
    );
    expect(result.messages[1]?.markdown).toContain(
      "See \uE000citation:0\uE001.",
    );
    expect(result.messages[1]?.markdown).not.toMatch(/^[ \t]+/mu);
    expect(result.messages[1]?.citations).toEqual([
      {
        title: "Example title",
        url: "https://example.com/source?utm_source=chatgpt.com",
      },
    ]);
  });

  it("renders targeted replies and visible reasoning summaries as blockquotes", () => {
    document.body.innerHTML = `
      <div data-message-id="a1" data-message-author-role="assistant">
        <div data-export-targeted-reply>Earlier answer</div>
        <div data-export-reasoning-summary>Checked the sources</div>
        <div class="markdown"><p>Final answer</p></div>
      </div>`;

    const message = extractVisibleConversation(document).messages[0];
    expect(message?.markdown).toContain("> Earlier answer");
    expect(message?.markdown).toContain("> **思考摘要**");
    expect(message?.markdown).toContain("> Checked the sources");
    expect(message?.markdown).toContain("Final answer");
  });

  it("replaces file placeholders without leaking internal markers", () => {
    document.body.innerHTML = `
      <div data-message-id="u1" data-message-author-role="user">
        <p>Review {{file:file-123}}</p>
        <a data-file-id="file-123" href="https://example.com/spec.md">spec.md</a>
      </div>`;

    const message = extractVisibleConversation(document).messages[0];
    expect(message?.markdown).toContain(
      "[spec.md](https://example.com/spec.md)",
    );
    expect(message?.markdown).not.toContain("{{file:");
  });
});
