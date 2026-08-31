import {
  completeConversationFromPayload,
  ConversationAlignmentError,
  normalizeConversationPayload,
} from "./conversation";
import {
  extractVisibleConversation,
  visibleBranchHints,
} from "./dom-extractor";
import type { ConversationPayload, ExtractedConversation } from "./types";

const MESSAGE_SOURCE = "chatgpt-markdown-exporter-page-bridge";

let capturedToken: string | undefined;
let capturedConversationId: string | undefined;

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (
    event.source !== window ||
    typeof event.data !== "object" ||
    event.data === null
  ) {
    return;
  }
  const data = event.data as Record<string, unknown>;
  if (data.source !== MESSAGE_SOURCE || data.type !== "session-context") return;
  if (typeof data.token === "string") capturedToken = data.token;
  if (typeof data.conversationId === "string") {
    capturedConversationId = data.conversationId;
  }
});

export function conversationIdFromLocation(
  locationValue: Location = window.location,
): string | undefined {
  const match = locationValue.pathname.match(/(?:^|\/)c\/([^/?#]+)/u);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return /(?:^|\/)c(?:\/|$)/u.test(locationValue.pathname)
    ? capturedConversationId
    : undefined;
}

async function sessionToken(
  signal: AbortSignal,
  forceRefresh = false,
): Promise<string | undefined> {
  if (capturedToken && !forceRefresh) return capturedToken;
  const response = await fetch(`${window.location.origin}/api/auth/session`, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) return undefined;
  const session = (await response.json()) as Record<string, unknown>;
  const token = session.accessToken;
  if (typeof token === "string" && token) capturedToken = token;
  return capturedToken;
}

async function requestConversation(
  conversationId: string,
  signal: AbortSignal,
  refreshToken = false,
): Promise<ConversationPayload> {
  const token = await sessionToken(signal, refreshToken);
  if (!token) throw new Error("ChatGPT session Token is unavailable");
  const response = await fetch(
    `${window.location.origin}/backend-api/conversation/${encodeURIComponent(conversationId)}`,
    {
      credentials: "include",
      headers: { authorization: `Bearer ${token}` },
      signal,
    },
  );
  if (response.status === 401 && !refreshToken) {
    capturedToken = undefined;
    return requestConversation(conversationId, signal, true);
  }
  if (!response.ok)
    throw new Error(`Conversation API returned ${response.status}`);
  return normalizeConversationPayload(await response.json());
}

function orderVisibleMessages(
  payload: ConversationPayload,
  visible: ExtractedConversation,
  documentNode: Document,
): ExtractedConversation {
  return completeConversationFromPayload(
    payload,
    visible,
    visibleBranchHints(documentNode),
  );
}

export interface LoadConversationResult {
  conversation: ExtractedConversation;
  source: "api";
}

export async function loadCurrentConversation(
  documentNode: Document,
): Promise<LoadConversationResult> {
  const visible = extractVisibleConversation(documentNode);
  if (visible.messages.length === 0) throw new Error("页面中没有可导出的消息");
  const conversationId = conversationIdFromLocation();
  if (!conversationId) throw new Error("当前页面不是已保存的 ChatGPT 对话");

  const signal = AbortSignal.timeout(15_000);
  let payload: ConversationPayload;
  try {
    payload = await requestConversation(conversationId, signal);
  } catch (error) {
    console.info("[ChatGPT Markdown 导出器] 完整对话读取失败", {
      stage: "conversation-load",
      reason: error instanceof Error ? error.message : "unknown error",
    });
    throw new Error(
      error instanceof DOMException && error.name === "TimeoutError"
        ? "完整对话加载超时，请重试"
        : "无法读取完整对话，请重试",
    );
  }

  try {
    return {
      conversation: orderVisibleMessages(payload, visible, documentNode),
      source: "api",
    };
  } catch (error) {
    if (!(error instanceof ConversationAlignmentError)) {
      console.info("[ChatGPT Markdown 导出器] 完整对话解析失败", {
        stage: "conversation-parse",
        reason: error instanceof Error ? error.message : "unknown error",
      });
      throw new Error("无法解析完整对话，请重试");
    }
  }

  try {
    const refreshedPayload = await requestConversation(conversationId, signal);
    return {
      conversation: orderVisibleMessages(
        refreshedPayload,
        visible,
        documentNode,
      ),
      source: "api",
    };
  } catch {
    throw new Error("页面消息已变化，请重试");
  }
}
