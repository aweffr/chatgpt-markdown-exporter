import { describe, expect, it } from "vitest";

import {
  alignVisibleMessagesToBranch,
  completeConversationFromPayload,
  normalizeConversationPayload,
  reconstructActiveBranch,
} from "../../src/conversation";
import type { ConversationPayload } from "../../src/types";
import type { ExtractedConversation } from "../../src/types";

function node(
  id: string,
  parent: string | null,
  children: string[],
  role: "user" | "assistant",
) {
  return {
    id,
    parent,
    children,
    message: {
      id,
      author: { role },
      content: { content_type: "text", parts: [id] },
      metadata: {},
    },
  };
}

const payload: ConversationPayload = {
  title: "Branch test",
  current_node: "assistant-old",
  mapping: {
    root: { id: "root", parent: null, children: ["user"] },
    user: node("user", "root", ["assistant-old", "assistant-new"], "user"),
    "assistant-old": node("assistant-old", "user", [], "assistant"),
    "assistant-new": node(
      "assistant-new",
      "user",
      ["assistant-leaf"],
      "assistant",
    ),
    "assistant-leaf": node("assistant-leaf", "assistant-new", [], "assistant"),
  },
};

describe("normalizeConversationPayload", () => {
  it("accepts direct and data-wrapped payloads", () => {
    expect(normalizeConversationPayload(payload)).toBe(payload);
    expect(normalizeConversationPayload({ data: payload })).toBe(payload);
  });

  it("finds a deeply nested payload", () => {
    expect(
      normalizeConversationPayload({ response: { body: { data: payload } } }),
    ).toBe(payload);
  });

  it("restores compact array references and numeric keys", () => {
    const compact = [
      { _1: 2, _3: 4, _5: 6 },
      "title",
      "Compact",
      "current_node",
      "assistant",
      "mapping",
      { _7: 8 },
      "assistant",
      {},
    ];
    expect(normalizeConversationPayload(compact)).toEqual({
      title: "Compact",
      current_node: "assistant",
      mapping: { assistant: {} },
    });
  });

  it("rejects unrelated response shapes", () => {
    expect(() =>
      normalizeConversationPayload({ result: { title: "missing mapping" } }),
    ).toThrow("Unsupported conversation response");
  });
});

describe("reconstructActiveBranch", () => {
  it("uses the last visible message before current_node and follows its last child", () => {
    expect(
      reconstructActiveBranch(payload, {
        visibleMessageIds: ["user", "assistant-new"],
        visibleTurnIds: [],
      }).map((item) => item.id),
    ).toEqual(["user", "assistant-new", "assistant-leaf"]);
  });

  it("uses a visible turn hint and excludes regenerated siblings", () => {
    expect(
      reconstructActiveBranch(payload, {
        visibleMessageIds: [],
        visibleTurnIds: ["assistant-new"],
      }).map((item) => item.id),
    ).toEqual(["user", "assistant-new", "assistant-leaf"]);
  });

  it("falls back to current_node when no DOM hint matches", () => {
    expect(
      reconstructActiveBranch(payload, {
        visibleMessageIds: ["missing"],
        visibleTurnIds: [],
      }).map((item) => item.id),
    ).toEqual(["user", "assistant-old"]);
  });
});

describe("alignVisibleMessagesToBranch", () => {
  const visible: ExtractedConversation = {
    title: "Visible",
    messages: [
      { id: "user", role: "user", markdown: "Question", citations: [] },
      {
        id: "assistant-new",
        role: "assistant",
        markdown: "Answer",
        citations: [],
      },
    ],
  };

  it("orders visible messages by the active branch", () => {
    const branch = reconstructActiveBranch(payload, {
      visibleMessageIds: ["assistant-new"],
      visibleTurnIds: [],
    });
    expect(
      alignVisibleMessagesToBranch(branch, visible).map((item) => item.id),
    ).toEqual(["user", "assistant-new"]);
  });

  it("fails when a visible message is outside the active branch", () => {
    const branch = reconstructActiveBranch(payload, {
      visibleMessageIds: [],
      visibleTurnIds: [],
    });
    expect(() => alignVisibleMessagesToBranch(branch, visible)).toThrow(
      "API and page messages do not match",
    );
  });
});

describe("completeConversationFromPayload", () => {
  it("keeps earlier API messages when only the bottom of a long conversation is rendered", () => {
    const longPayload: ConversationPayload = {
      title: "Long conversation",
      current_node: "assistant-2",
      mapping: {
        root: { id: "root", parent: null, children: ["user-1"] },
        "user-1": node("user-1", "root", ["assistant-1"], "user"),
        "assistant-1": node("assistant-1", "user-1", ["user-2"], "assistant"),
        "user-2": node("user-2", "assistant-1", ["assistant-2"], "user"),
        "assistant-2": node("assistant-2", "user-2", [], "assistant"),
      },
    };
    const visibleBottom: ExtractedConversation = {
      title: "Visible bottom",
      messages: [
        { id: "user-2", role: "user", markdown: "user-2", citations: [] },
        {
          id: "assistant-2",
          role: "assistant",
          markdown: "assistant-2",
          citations: [],
        },
      ],
    };

    expect(
      completeConversationFromPayload(longPayload, visibleBottom, {
        visibleMessageIds: ["user-2", "assistant-2"],
        visibleTurnIds: [],
      }).messages.map((message) => message.id),
    ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
  });

  it("keeps high-fidelity DOM content for mounted messages", () => {
    const visible: ExtractedConversation = {
      title: "Visible",
      messages: [
        {
          id: "assistant-old",
          role: "assistant",
          markdown: "> **思考摘要**\n>\n> 页面摘要\n\n页面答案",
          citations: [],
          model: "gpt-5-6-thinking",
        },
      ],
    };

    expect(
      completeConversationFromPayload(payload, visible, {
        visibleMessageIds: ["assistant-old"],
        visibleTurnIds: [],
      }).messages[1]?.markdown,
    ).toBe("> **思考摘要**\n>\n> 页面摘要\n\n页面答案");
  });

  it("adds API-only grouped sources to a mounted DOM message", () => {
    const citationPayload: ConversationPayload = {
      title: "Citations",
      current_node: "assistant",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant"] },
        assistant: {
          id: "assistant",
          parent: "root",
          children: [],
          message: {
            id: "assistant",
            author: { role: "assistant" },
            content: {
              content_type: "text",
              parts: ["API \uE200cite\uE202turn0search0\uE201"],
            },
            metadata: {
              content_references: [
                {
                  type: "grouped_webpages",
                  matched_text: "\uE200cite\uE202turn0search0\uE201",
                  items: [
                    {
                      title: "来源一",
                      url: "https://example.com/one",
                    },
                    {
                      title: "来源二",
                      url: "https://example.com/two",
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    };
    const visible: ExtractedConversation = {
      title: "Visible",
      messages: [
        {
          id: "assistant",
          role: "assistant",
          markdown: "页面答案 \uE000citation:0\uE001",
          citations: [
            {
              title: "来源一",
              url: "https://example.com/one?utm_source=chatgpt.com",
            },
          ],
        },
      ],
    };

    const message = completeConversationFromPayload(citationPayload, visible, {
      visibleMessageIds: ["assistant"],
      visibleTurnIds: [],
    }).messages[0];
    expect(message?.citations.map((citation) => citation.title)).toEqual([
      "来源一",
      "来源二",
    ]);
    expect(message?.markdown).toBe(
      "页面答案 \uE000citation:0\uE001\n\n\uE000citation:1\uE001",
    );
  });
});
