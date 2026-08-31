import { describe, expect, it } from "vitest";

import { apiMessageFromNode } from "../../src/api-message";
import type { ConversationNode } from "../../src/types";

describe("apiMessageFromNode", () => {
  it("converts raw Markdown and grouped web citations", () => {
    const node: ConversationNode = {
      id: "assistant-1",
      parent: "user-1",
      children: [],
      message: {
        id: "assistant-1",
        author: { role: "assistant" },
        content: {
          content_type: "text",
          parts: ["完整回答 \uE200cite\uE202turn0search0\uE201"],
        },
        recipient: "all",
        metadata: {
          model_slug: "gpt-5-6-thinking",
          content_references: [
            {
              type: "grouped_webpages",
              matched_text: "\uE200cite\uE202turn0search0\uE201",
              start_idx: 5,
              end_idx: 29,
              items: [
                { title: "来源一", url: "https://example.com/one" },
                { title: "来源二", url: "https://example.com/two" },
              ],
            },
          ],
        },
      },
    };

    expect(apiMessageFromNode(node)).toEqual({
      id: "assistant-1",
      role: "assistant",
      markdown: "完整回答 \uE000citation:0\uE001 \uE000citation:1\uE001",
      citations: [
        { title: "来源一", url: "https://example.com/one" },
        { title: "来源二", url: "https://example.com/two" },
      ],
      model: "gpt-5-6-thinking",
    });
  });

  it("skips visually hidden assistant nodes", () => {
    const node: ConversationNode = {
      id: "hidden",
      parent: "user-1",
      children: [],
      message: {
        id: "hidden",
        author: { role: "assistant" },
        content: { content_type: "text", parts: ["internal"] },
        metadata: { is_visually_hidden_from_conversation: true },
      },
    };

    expect(apiMessageFromNode(node)).toBeNull();
  });

  it("preserves API image and attachment links for messages outside the DOM", () => {
    const imageNode: ConversationNode = {
      id: "user-image",
      parent: "root",
      children: [],
      message: {
        id: "user-image",
        author: { role: "user" },
        content: {
          content_type: "multimodal_text",
          parts: [
            "请看 {{file:file-1}}",
            {
              content_type: "image_asset_pointer",
              asset_pointer: "https://example.com/image.png",
            },
          ],
        },
        metadata: {
          attachments: [
            {
              id: "file-1",
              name: "说明.md",
              url: "https://example.com/file.md",
            },
          ],
        },
      },
    };

    expect(apiMessageFromNode(imageNode)?.markdown).toBe(
      "请看 [说明.md](https://example.com/file.md)\n\n![图片](https://example.com/image.png)",
    );
  });
});
