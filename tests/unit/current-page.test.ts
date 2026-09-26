import { describe, expect, it } from "vitest";
import {
  extractVisibleConversation,
  visibleBranchHints,
} from "../../src/dom-extractor";
import { firstMatch, SELECTORS } from "../../src/selectors";

describe("current ChatGPT page", () => {
  it("extracts message identities, content and branch hints without UI labels", () => {
    document.body.innerHTML = `
      <div data-turn-key="user-1">
        <div data-chatgpt-search-message-ids="user-1" data-chatgpt-search-unit-key="turn:0:user">
          <h4>你说：</h4>
          <div data-user-message-bubble><div class="whitespace-pre-wrap">First line\n\nSecond line</div></div>
          <button>复制消息</button>
        </div>
        <div data-chatgpt-search-message-ids="tool-1 assistant-1 assistant-1">
          <h4 data-conversation-role="assistant">ChatGPT 说：</h4>
          <div data-chatgpt-selection-message-id="assistant-1">
            <div data-markdown-text-style="assistant-message">
              <p>Answer <a data-testid="chatgpt-citation" href="https://example.com/source" aria-label="Example: Full source title, https://example.com/source, 另外 1 个来源">Example+1</a></p>
              <div data-markdown-copy="code-block"><div data-markdown-copy="exclude">纯文本<button>复制</button></div><div><code><span>one</span>\n<span>  two</span></code></div></div>
              <button aria-label="打开第 1 张图像"><img alt="diagram" src="https://example.com/image.png"></button>
              <div data-markdown-copy="exclude">展开表格</div>
            </div>
            <button>重新生成回复</button>
          </div>
        </div>
      </div>`;
    const messages = extractVisibleConversation(document).messages;
    expect(messages.map(({ id, role }) => ({ id, role }))).toEqual([
      { id: "user-1", role: "user" },
      { id: "assistant-1", role: "assistant" },
    ]);
    expect(messages[0]?.markdown).toBe("First line\n\nSecond line");
    expect(messages[1]?.markdown).toContain("```\none\n  two\n```");
    expect(messages[1]?.markdown).toContain(
      "![diagram](https://example.com/image.png)",
    );
    expect(messages[1]?.markdown).not.toMatch(
      /ChatGPT 说|复制|展开表格|重新生成|纯文本/,
    );
    expect(messages[1]?.citations).toEqual([
      {
        title: "Example: Full source title",
        url: "https://example.com/source",
      },
    ]);
    expect(visibleBranchHints(document)).toEqual({
      visibleMessageIds: ["user-1", "assistant-1"],
      visibleTurnIds: ["user-1"],
    });
  });

  it("anchors export to the current composer surface", () => {
    document.body.innerHTML = `<form data-chatgpt-composer><div><div data-composer-surface-variant="default"><div data-composer-body><div contenteditable="true" data-composer-markdown role="textbox"></div></div></div></div></form>`;
    expect(firstMatch(document, SELECTORS.composer)).toBe(
      document.querySelector("[data-composer-surface-variant]"),
    );
  });

  it("keeps uploaded file names and file citations without inventing download URLs", () => {
    document.body.innerHTML = `
      <div data-chatgpt-search-message-ids="user-1">
        <span class="group/resource-card"><button class="peer/resource-card" aria-label="report.txt"></button></span>
        <div data-user-message-bubble><div class="whitespace-pre-wrap">Read this file</div></div>
      </div>
      <div data-chatgpt-search-message-ids="assistant-1">
        <div data-chatgpt-selection-message-id="assistant-1">
          <div data-markdown-text-style="assistant-message"><p>Source <button data-testid="chatgpt-library-file-citation" aria-label="打开 report.txt 的预览">report…</button></p></div>
        </div>
      </div>`;
    const messages = extractVisibleConversation(document).messages;
    expect(messages[0]?.markdown).toBe("[附件：report.txt]\n\nRead this file");
    expect(messages[1]?.markdown).toBe("Source [附件：report.txt]");
  });
});
