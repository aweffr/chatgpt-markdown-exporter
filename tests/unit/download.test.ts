import { describe, expect, it, vi } from "vitest";

import {
  createDownloadRequest,
  isDownloadRequest,
  markdownDataUrl,
} from "../../src/download";

describe("Markdown download contract", () => {
  it("always includes the sanitized .md filename", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T18:24:00+08:00"));
    expect(createDownloadRequest("对话/标题", "# 内容")).toEqual({
      type: "download-markdown",
      filename: "对话-标题-2026-08-31-18-24.md",
      markdown: "# 内容",
    });
    vi.useRealTimers();
  });

  it("validates service-worker messages", () => {
    expect(
      isDownloadRequest({
        type: "download-markdown",
        filename: "对话.md",
        markdown: "# 内容",
      }),
    ).toBe(true);
    expect(isDownloadRequest({ type: "download-markdown", filename: "" })).toBe(
      false,
    );
  });

  it("creates a UTF-8 Markdown data URL", () => {
    const url = markdownDataUrl("# 中文");
    expect(url).toBe(
      "data:text/markdown;charset=utf-8,%23%20%E4%B8%AD%E6%96%87",
    );
  });
});
