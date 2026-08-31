import { createCitationToken } from "./markdown";
import type {
  CitationSource,
  ConversationNode,
  ExportMessage,
  MessageRole,
} from "./types";

const UNHANDLED_CITATION = /\uE200cite(?:\uE202[^\uE200\uE201]*)+\uE201/gu;
const OLD_CITATION = /【(\d+)†\((.+?)\)】/gu;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sourceFrom(value: unknown): CitationSource | null {
  const item = record(value);
  if (!item) return null;
  const url = stringValue(item.url);
  if (!url) return null;
  return {
    title: stringValue(item.attribution) ?? stringValue(item.title) ?? url,
    url,
  };
}

function referenceSources(
  reference: Record<string, unknown>,
): CitationSource[] {
  const values: unknown[] = [];
  for (const key of ["items", "sources", "fallback_items"]) {
    const items = reference[key];
    if (Array.isArray(items)) {
      for (const item of items) {
        values.push(item);
        const supporting = record(item)?.supporting_websites;
        if (Array.isArray(supporting)) values.push(...supporting);
      }
    }
  }
  values.push(reference);
  const safeUrls = reference.safe_urls;
  if (Array.isArray(safeUrls)) {
    values.push(
      ...safeUrls.map((url) =>
        typeof url === "string" ? { title: url, url } : url,
      ),
    );
  }

  const seen = new Set<string>();
  return values
    .map(sourceFrom)
    .filter((source): source is CitationSource => source !== null)
    .filter((source) => {
      if (seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    });
}

function applyCitations(
  input: string,
  metadata: Record<string, unknown>,
): { markdown: string; citations: CitationSource[] } {
  const citations: CitationSource[] = [];
  const citationIndex = new Map<string, number>();
  const addSource = (source: CitationSource): string => {
    let index = citationIndex.get(source.url);
    if (index === undefined) {
      index = citations.length;
      citationIndex.set(source.url, index);
      citations.push(source);
    }
    return createCitationToken(index);
  };

  let markdown = input
    .replaceAll(/[\u00A0\u202F\u2007\u2060]/gu, " ")
    .replaceAll(/[\uE203\uE204]/gu, "");
  const references = Array.isArray(metadata.content_references)
    ? metadata.content_references.map(record).filter(Boolean)
    : [];

  for (const reference of [...references].sort(
    (left, right) =>
      String(right?.matched_text ?? "").length -
      String(left?.matched_text ?? "").length,
  )) {
    if (!reference || reference.type === "sources_footnote") continue;
    const matchedText = stringValue(reference.matched_text);
    if (!matchedText) continue;
    const replacement = referenceSources(reference).map(addSource).join(" ");
    markdown = markdown.replaceAll(matchedText, replacement);
  }

  const legacy = Array.isArray(metadata.citations)
    ? metadata.citations.map(record).filter(Boolean)
    : [];
  markdown = markdown.replace(OLD_CITATION, (original, rawIndex: string) => {
    const citation = legacy.find(
      (item) =>
        record(record(item)?.metadata)?.extra &&
        record(record(record(item)?.metadata)?.extra)?.cited_message_idx ===
          Number(rawIndex),
    );
    const source = sourceFrom(record(citation)?.metadata);
    return source ? addSource(source) : original;
  });

  markdown = markdown.replace(UNHANDLED_CITATION, "");
  const trailingSources = references
    .filter((reference) => reference?.type === "sources_footnote")
    .flatMap((reference) => (reference ? referenceSources(reference) : []))
    .filter((source) => !citationIndex.has(source.url));
  if (trailingSources.length) {
    markdown = `${markdown.trimEnd()}\n\n${trailingSources
      .map(addSource)
      .join(" ")}`;
  }

  return { markdown: markdown.trim(), citations };
}

function blockquote(value: string): string {
  return value
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

function contentMarkdown(content: Record<string, unknown>): string {
  const contentType = stringValue(content.content_type) ?? "text";
  if (contentType === "text") {
    return Array.isArray(content.parts)
      ? content.parts
          .filter((part): part is string => typeof part === "string")
          .join("\n")
      : "";
  }
  if (contentType === "multimodal_text" && Array.isArray(content.parts)) {
    return content.parts
      .map((part) => {
        if (typeof part === "string") return part;
        const item = record(part);
        if (!item) return "";
        if (item.content_type === "image_asset_pointer") {
          const url = stringValue(item.asset_pointer);
          return url ? `![图片](${url})` : "";
        }
        if (item.content_type === "audio_transcription") {
          return stringValue(item.text) ?? "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  if (contentType === "code") {
    const language = stringValue(content.language) ?? "";
    const text = stringValue(content.text) ?? "";
    return text ? `\`\`\`${language}\n${text}\n\`\`\`` : "";
  }
  if (contentType === "execution_output") {
    const text = stringValue(content.text) ?? "";
    return text ? `\`\`\`text\n${text}\n\`\`\`` : "";
  }
  if (contentType === "tether_quote") {
    const text = stringValue(content.text) ?? stringValue(content.title) ?? "";
    return text ? blockquote(text) : "";
  }
  return "";
}

function targetedReply(metadata: Record<string, unknown>): string | undefined {
  const value = metadata.targetedReply ?? metadata.targeted_reply;
  if (typeof value === "string") return stringValue(value);
  const item = record(value);
  if (!item) return undefined;
  return (
    stringValue(item.content) ??
    stringValue(item.text) ??
    stringValue(item.quote)
  );
}

function replaceFilePlaceholders(
  input: string,
  metadata: Record<string, unknown>,
): string {
  const attachments = new Map<string, { name: string; url?: string }>();
  if (Array.isArray(metadata.attachments)) {
    for (const value of metadata.attachments) {
      const attachment = record(value);
      if (!attachment) continue;
      const id = stringValue(attachment.id) ?? stringValue(attachment.file_id);
      if (!id) continue;
      const name =
        stringValue(attachment.name) ??
        stringValue(attachment.file_name) ??
        "附件";
      const url =
        stringValue(attachment.url) ??
        stringValue(attachment.download_url) ??
        stringValue(attachment.asset_pointer);
      attachments.set(id, { name, ...(url ? { url } : {}) });
    }
  }
  return input.replace(/\{\{file:([^}]+)\}\}/gu, (_match, rawId: string) => {
    const attachment = attachments.get(rawId.trim());
    if (!attachment) return "";
    return attachment.url
      ? `[${attachment.name}](${attachment.url})`
      : `[附件：${attachment.name}]`;
  });
}

export function apiMessageFromNode(
  node: ConversationNode,
): ExportMessage | null {
  const message = node.message;
  const role = message?.author?.role;
  if (role !== "user" && role !== "assistant") return null;
  const metadata = message?.metadata ?? {};
  if (metadata.is_visually_hidden_from_conversation === true) return null;
  if (
    role === "assistant" &&
    message?.recipient &&
    message.recipient !== "all" &&
    !message.recipient.startsWith("canmore.")
  ) {
    return null;
  }
  if (message?.channel === "analysis") return null;
  const id = message?.id ?? node.id;
  const content = record(message?.content);
  if (!id || !content) return null;
  const converted = applyCitations(
    replaceFilePlaceholders(contentMarkdown(content), metadata),
    metadata,
  );
  const quote = targetedReply(metadata);
  const markdown = [quote ? blockquote(quote) : "", converted.markdown]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (!markdown) return null;
  const model = stringValue(metadata.model_slug);
  return {
    id,
    role: role as MessageRole,
    markdown,
    citations: converted.citations,
    ...(model ? { model } : {}),
  };
}
