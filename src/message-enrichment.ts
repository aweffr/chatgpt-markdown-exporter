import type { ConversationNode, ExportMessage } from "./types";

function knownText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["content", "text", "quote"]) {
    const text = record[key];
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  if (Array.isArray(record.parts)) {
    const parts = record.parts.filter(
      (part): part is string => typeof part === "string",
    );
    const text = parts.join("\n").trim();
    if (text) return text;
  }
  return undefined;
}

function quoted(value: string): string {
  return value
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

function modelFromNode(node: ConversationNode): string | undefined {
  const metadata = node.message?.metadata;
  if (!metadata) return undefined;
  for (const key of ["model_slug", "default_model_slug", "model"]) {
    const value = metadata[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

export function enrichVisibleMessage(
  visible: ExportMessage,
  node: ConversationNode,
): ExportMessage {
  const metadata = node.message?.metadata;
  const targetedReply = knownText(
    metadata?.targetedReply ?? metadata?.targeted_reply,
  );
  const markdown =
    targetedReply && !visible.markdown.includes(targetedReply)
      ? `${quoted(targetedReply)}\n\n${visible.markdown}`
      : visible.markdown;
  const model = visible.model ?? modelFromNode(node);
  return {
    ...visible,
    markdown,
    ...(model ? { model } : {}),
  };
}
