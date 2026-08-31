import { describe, expect, it, vi } from "vitest";

import {
  createCitationToken,
  markdownFilename,
  renderMarkdown,
  sanitizeFilename,
} from "../../src/markdown";
import type { ExportMessage } from "../../src/types";

const messages: ExportMessage[] = [
  {
    id: "u1",
    role: "user",
    markdown: "请解释表格。",
    citations: [],
  },
  {
    id: "a1",
    role: "assistant",
    model: "gpt-5-6-thinking",
    markdown: [
      `结论${createCitationToken(0)}，再次引用${createCitationToken(1)}。`,
      "",
      "```ts",
      "const answer: number = 42;",
      "```",
      "",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "![示意图](https://example.com/image.png)",
      "[附件](https://example.com/report.pdf)",
    ].join("\n"),
    citations: [
      { title: "Example source", url: "https://example.com/page?utm_source=x" },
      { title: "Same source", url: "https://example.com/page" },
    ],
  },
  {
    id: "a2",
    role: "assistant",
    markdown: `未选择来源${createCitationToken(0)}`,
    citations: [{ title: "Unused", url: "https://unused.example/path" }],
  },
];

describe("renderMarkdown", () => {
  it("filters messages in stable order and renumbers canonical citations", () => {
    const output = renderMarkdown(
      "Conversation title",
      messages,
      new Set(["u1", "a1"]),
    );

    expect(output).toContain("# Conversation title");
    expect(output).toMatch(/^# Conversation title\n\n## 用户/u);
    expect(output).toContain("## 用户\n\n请解释表格。");
    expect(output).toContain("## ChatGPT · GPT-5.6");
    expect(output).toContain("结论[^1]，再次引用[^1]。");
    expect(output).toContain(
      "[^1]: [Example source](https://example.com/page)",
    );
    expect(output).not.toContain("Unused");
    expect(output).not.toContain("watermark");
    expect(output).not.toContain("exporter");
    expect(output).toContain("```ts\nconst answer: number = 42;\n```");
    expect(output).toContain("![示意图](https://example.com/image.png)");
  });

  it("omits a model suffix when metadata is unavailable", () => {
    const output = renderMarkdown(
      "Title",
      [{ id: "a", role: "assistant", markdown: "Answer", citations: [] }],
      new Set(["a"]),
    );
    expect(output).toContain("## ChatGPT\n\nAnswer");
    expect(output).not.toContain("ChatGPT ·");
  });

  it("uses the source hostname when its title is empty and skips invalid URLs", () => {
    const output = renderMarkdown(
      "Title",
      [
        {
          id: "a",
          role: "assistant",
          markdown: `${createCitationToken(0)} ${createCitationToken(1)}`,
          citations: [
            { title: "", url: "https://docs.example.com/path" },
            { title: "Broken", url: "javascript:alert(1)" },
          ],
        },
      ],
      new Set(["a"]),
    );
    expect(output).toContain(
      "[^1]: [docs.example.com](https://docs.example.com/path)",
    );
    expect(output).not.toContain("Broken");
  });
});

describe("sanitizeFilename", () => {
  it("removes filesystem separators and reserved characters", () => {
    expect(sanitizeFilename(' A/B:C*D? "E" ')).toBe("A-B-C-D- E");
  });

  it("creates a complete Markdown download filename", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T18:24:00+08:00"));
    expect(markdownFilename("导出测试对话")).toBe(
      "导出测试对话-2026-08-31-18-24.md",
    );
    vi.useRealTimers();
  });
});
