import { describe, expect, it } from "vitest";

import { enrichVisibleMessage } from "../../src/message-enrichment";
import type { ConversationNode, ExportMessage } from "../../src/types";

const visible: ExportMessage = {
  id: "assistant",
  role: "assistant",
  markdown: "New answer",
  citations: [],
};

describe("enrichVisibleMessage", () => {
  it("adds a targetedReply blockquote and model metadata", () => {
    const node: ConversationNode = {
      id: "assistant",
      parent: "user",
      children: [],
      message: {
        id: "assistant",
        author: { role: "assistant" },
        content: { parts: ["New answer"] },
        metadata: {
          targetedReply: { content: "Earlier answer" },
          model_slug: "gpt-5-6-thinking",
        },
      },
    };

    expect(enrichVisibleMessage(visible, node)).toEqual({
      ...visible,
      model: "gpt-5-6-thinking",
      markdown: "> Earlier answer\n\nNew answer",
    });
  });

  it("does not duplicate a quote already visible in the page", () => {
    const node: ConversationNode = {
      message: {
        metadata: { targeted_reply: "Earlier answer" },
      },
    };
    const alreadyVisible = {
      ...visible,
      markdown: "> Earlier answer\n\nNew answer",
    };
    expect(enrichVisibleMessage(alreadyVisible, node).markdown).toBe(
      alreadyVisible.markdown,
    );
  });
});
