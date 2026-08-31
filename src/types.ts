export type MessageRole = "user" | "assistant";

export interface CitationSource {
  title: string;
  url: string;
}

export interface ExportMessage {
  id: string;
  role: MessageRole;
  markdown: string;
  citations: CitationSource[];
  model?: string;
}

export interface ExtractedConversation {
  title: string;
  messages: ExportMessage[];
}

export interface ConversationAuthor {
  role?: string;
}

export interface ConversationContent {
  content_type?: string;
  parts?: unknown[];
  text?: string;
  title?: string;
  language?: string;
}

export interface ConversationMessage {
  id?: string;
  author?: ConversationAuthor;
  content?: ConversationContent;
  metadata?: Record<string, unknown>;
  recipient?: string;
  channel?: string | null;
}

export interface ConversationNode {
  id?: string;
  parent?: string | null;
  children?: string[];
  message?: ConversationMessage | null;
}

export interface ConversationPayload {
  title?: string;
  current_node?: string;
  mapping: Record<string, ConversationNode>;
}

export interface VisibleBranchHints {
  visibleMessageIds: string[];
  visibleTurnIds: string[];
}
