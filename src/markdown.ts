import type { CitationSource, ExportMessage } from "./types";

const CITATION_PREFIX = "\uE000citation:";
const CITATION_SUFFIX = "\uE001";
const CITATION_PATTERN = /\uE000citation:(\d+)\uE001/g;

export function createCitationToken(index: number): string {
  return `${CITATION_PREFIX}${index}${CITATION_SUFFIX}`;
}

function canonicalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_")) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function citationTitle(source: CitationSource, canonicalUrl: string): string {
  const title = source.title.trim();
  if (title) return title.replaceAll("[", "\\[").replaceAll("]", "\\]");
  return new URL(canonicalUrl).hostname;
}

export function normalizeModelVersion(
  model: string | undefined,
): string | undefined {
  if (!model) return undefined;
  const normalized = model
    .trim()
    .toLowerCase()
    .replace(/-(thinking|auto|instant|pro|research)$/u, "");
  const gptMatch = /^gpt-(\d+)(?:-(\d+))?([a-z]+)?$/u.exec(normalized);
  if (gptMatch) {
    const [, major, minor, suffix] = gptMatch;
    return `GPT-${major}${minor ? `.${minor}` : ""}${suffix ?? ""}`;
  }
  if (/^o\d+(?:-[a-z0-9]+)*$/u.test(normalized)) return normalized;
  return undefined;
}

export function renderMarkdown(
  title: string,
  messages: readonly ExportMessage[],
  selectedIds: ReadonlySet<string>,
): string {
  const footnoteNumbers = new Map<string, number>();
  const footnotes: Array<{ number: number; title: string; url: string }> = [];
  const sections: string[] = [];

  for (const message of messages) {
    if (!selectedIds.has(message.id)) continue;
    const body = message.markdown.replace(
      CITATION_PATTERN,
      (_match, rawIndex: string) => {
        const source = message.citations[Number(rawIndex)];
        if (!source) return "";
        const canonicalUrl = canonicalizeUrl(source.url);
        if (!canonicalUrl) return "";
        let number = footnoteNumbers.get(canonicalUrl);
        if (!number) {
          number = footnoteNumbers.size + 1;
          footnoteNumbers.set(canonicalUrl, number);
          footnotes.push({
            number,
            title: citationTitle(source, canonicalUrl),
            url: canonicalUrl,
          });
        }
        return `[^${number}]`;
      },
    );
    const model = normalizeModelVersion(message.model);
    const heading =
      message.role === "user" ? "用户" : `ChatGPT${model ? ` · ${model}` : ""}`;
    sections.push(`## ${heading}\n\n${body.trim()}`);
  }

  const safeTitle = title.trim() || "ChatGPT 对话";
  const output = sections.length
    ? `# ${safeTitle}\n\n${sections.join("\n\n---\n\n")}`
    : `# ${safeTitle}`;
  if (footnotes.length === 0) return `${output}\n`;
  return `${output}\n\n---\n\n${footnotes
    .map((source) => `[^${source.number}]: [${source.title}](${source.url})`)
    .join("\n")}\n`;
}

export function sanitizeFilename(title: string): string {
  const sanitized = title
    .replace(/[\\/:*?<>|]/gu, "-")
    .replaceAll('"', "")
    .replace(/\s+/gu, " ")
    .replace(/^[.\s]+|[.\s]+$/gu, "")
    .slice(0, 120);
  return sanitized || "ChatGPT 对话";
}

export function markdownFilename(title: string): string {
  const now = new Date();
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  const timestamp = [
    now.getFullYear(),
    twoDigits(now.getMonth() + 1),
    twoDigits(now.getDate()),
    twoDigits(now.getHours()),
    twoDigits(now.getMinutes()),
  ].join("-");
  return `${sanitizeFilename(title)}-${timestamp}.md`;
}
