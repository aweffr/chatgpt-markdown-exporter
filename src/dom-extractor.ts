import { createCitationToken } from "./markdown";
import {
  allMatches,
  pageMessages,
  SELECTORS,
  type PageMessage,
} from "./selectors";
import type {
  CitationSource,
  ExportMessage,
  ExtractedConversation,
} from "./types";

interface ConversionContext {
  citations: CitationSource[];
  placeholderFileIds: Set<string>;
  preserveTextWhitespace: boolean;
}

function isElementHidden(element: Element): boolean {
  const hiddenAncestor = element.closest('[hidden], [aria-hidden="true"]');
  if (hiddenAncestor) return true;
  if (
    "checkVisibility" in element &&
    typeof element.checkVisibility === "function"
  ) {
    if (
      !element.checkVisibility({
        checkOpacity: false,
        checkVisibilityCSS: true,
      })
    ) {
      return true;
    }
  }
  return (
    element.hasAttribute("hidden") ||
    element.getAttribute("aria-hidden") === "true" ||
    (element instanceof HTMLElement && element.style.display === "none")
  );
}

function escapeInline(value: string): string {
  return value.replace(/([\\`])/gu, "\\$1");
}

function compactText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function blockquote(value: string): string {
  return value
    .trim()
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

function normalizeBlocks(value: string): string {
  return value
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function languageFor(code: Element): string {
  for (const className of code.classList) {
    if (className.startsWith("language-")) return className.slice(9);
  }
  return "";
}

function renderTable(
  table: HTMLTableElement,
  context: ConversionContext,
): string {
  const rows = [...table.querySelectorAll("tr")].map((row) =>
    [...row.querySelectorAll(":scope > th, :scope > td")].map((cell) =>
      normalizeBlocks(convertChildren(cell, context)).replaceAll("|", "\\|"),
    ),
  );
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [
    ...row,
    ...Array<string>(Math.max(0, width - row.length)).fill(""),
  ]);
  const header = normalized[0] ?? [];
  const body = normalized.slice(1);
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function renderList(list: Element, context: ConversionContext): string {
  const ordered = list.tagName === "OL";
  const items = [...list.children].filter((child) => child.tagName === "LI");
  return items
    .map((item, index) => {
      const marker = ordered ? `${index + 1}.` : "-";
      const content = normalizeBlocks(convertChildren(item, context));
      const [first = "", ...rest] = content.split("\n");
      return `${marker} ${first}${rest.length ? `\n${rest.map((line) => `  ${line}`).join("\n")}` : ""}`;
    })
    .join("\n");
}

function citationFrom(element: Element): CitationSource | null {
  const anchor =
    element instanceof HTMLAnchorElement
      ? element
      : element.querySelector<HTMLAnchorElement>("a[href]");
  if (!anchor) return null;
  const url = anchor.href;
  const label = compactText(anchor.getAttribute("aria-label") ?? "");
  const urlStart = label.indexOf(", http");
  const title =
    (urlStart >= 0 ? label.slice(0, urlStart) : "") ||
    compactText(anchor.textContent ?? "") ||
    compactText(anchor.getAttribute("aria-label") ?? "") ||
    compactText(anchor.getAttribute("title") ?? "");
  return { title, url };
}

function convertElement(element: Element, context: ConversionContext): string {
  if (isElementHidden(element)) return "";
  if (element.matches('[data-markdown-copy="exclude"]')) return "";
  if (element.matches(SELECTORS.fileCitation)) {
    const name = compactText(
      element.getAttribute("aria-label") ?? element.textContent ?? "",
    )
      .replace(/^打开 (.*) 的预览$/u, "$1")
      .replace(/^Open (.*) preview$/iu, "$1");
    return name ? `[附件：${name}]` : "";
  }
  if (element.matches(SELECTORS.citation)) {
    const citation = citationFrom(element);
    if (!citation) return convertChildren(element, context);
    const index = context.citations.push(citation) - 1;
    return createCitationToken(index);
  }

  const tag = element.tagName;
  if (tag === "PRE" || element.matches('[data-markdown-copy="code-block"]')) {
    const code = element.querySelector("code") ?? element;
    const source = (code.textContent ?? "").replace(/\n+$/u, "");
    const fence = source.includes("```") ? "````" : "```";
    return `\n\n${fence}${languageFor(code)}\n${source}\n${fence}\n\n`;
  }
  if (tag === "BUTTON") {
    return [...element.querySelectorAll("img")]
      .map((image) => convertElement(image, context))
      .join("\n\n");
  }
  if (["SCRIPT", "STYLE", "SVG", "NOSCRIPT"].includes(tag)) return "";
  if (tag === "BR") return "\n";
  if (tag === "HR") return "\n\n---\n\n";
  if (tag === "IMG") {
    const image = element as HTMLImageElement;
    return image.src ? `![${escapeInline(image.alt)}](${image.src})` : "";
  }
  if (tag === "A") {
    const anchor = element as HTMLAnchorElement;
    const fileId = anchor.dataset.fileId;
    if (fileId && context.placeholderFileIds.has(fileId)) return "";
    const label =
      normalizeBlocks(convertChildren(element, context)) || anchor.href;
    return anchor.href ? `[${label}](${anchor.href})` : label;
  }
  if (tag === "STRONG" || tag === "B")
    return `**${convertChildren(element, context)}**`;
  if (tag === "EM" || tag === "I")
    return `*${convertChildren(element, context)}*`;
  if (tag === "DEL" || tag === "S")
    return `~~${convertChildren(element, context)}~~`;
  if (tag === "CODE" && element.parentElement?.tagName !== "PRE") {
    const value = element.textContent ?? "";
    const fence = value.includes("`") ? "``" : "`";
    return `${fence}${value}${fence}`;
  }
  if (/^H[1-6]$/u.test(tag)) {
    const level = Number(tag.slice(1));
    return `\n\n${"#".repeat(level)} ${normalizeBlocks(convertChildren(element, context))}\n\n`;
  }
  if (tag === "P")
    return `${normalizeBlocks(convertChildren(element, context))}\n\n`;
  if (tag === "BLOCKQUOTE")
    return `\n\n${blockquote(convertChildren(element, context))}\n\n`;
  if (tag === "UL" || tag === "OL")
    return `\n\n${renderList(element, context)}\n\n`;
  if (tag === "TABLE")
    return `\n\n${renderTable(element as HTMLTableElement, context)}\n\n`;
  if (element.classList.contains("katex-display")) {
    const tex = element.querySelector(
      'annotation[encoding="application/x-tex"]',
    )?.textContent;
    if (tex) return `\n\n$$\n${tex}\n$$\n\n`;
  }
  if (element.classList.contains("katex")) {
    const tex = element.querySelector(
      'annotation[encoding="application/x-tex"]',
    )?.textContent;
    if (tex) return `$${tex}$`;
  }
  if (["DIV", "SECTION", "ARTICLE"].includes(tag)) {
    return convertChildren(element, context);
  }
  return convertChildren(element, context);
}

function convertNode(node: Node, context: ConversionContext): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (context.preserveTextWhitespace) return text;
    if (!text.trim() && /[\r\n]/u.test(text)) return "";
    return text.replace(/\s+/gu, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  return convertElement(node as Element, context);
}

function convertChildren(node: Node, context: ConversionContext): string {
  return [...node.childNodes]
    .map((child) => convertNode(child, context))
    .join("");
}

interface Attachment {
  id: string;
  name: string;
  url?: string;
}

function collectAttachments(root: Element): Map<string, Attachment> {
  const attachments = new Map<string, Attachment>();
  root.querySelectorAll<HTMLElement>("[data-file-id]").forEach((element) => {
    const id = element.dataset.fileId;
    if (!id) return;
    const anchor =
      element instanceof HTMLAnchorElement
        ? element
        : element.querySelector<HTMLAnchorElement>("a[href]");
    const name =
      compactText(element.textContent ?? "") ||
      element.dataset.fileName ||
      "附件";
    attachments.set(id, {
      id,
      name,
      ...(anchor?.href ? { url: anchor.href } : {}),
    });
  });
  return attachments;
}

function replaceFilePlaceholders(
  markdown: string,
  attachments: ReadonlyMap<string, Attachment>,
): string {
  return markdown.replace(/\{\{file:([^}]+)\}\}/gu, (_match, rawId: string) => {
    const attachment = attachments.get(rawId.trim());
    if (!attachment) return "";
    return attachment.url
      ? `[${attachment.name}](${attachment.url})`
      : `[附件：${attachment.name}]`;
  });
}

function visibleText(
  root: Element,
  selectors: readonly string[],
): string | undefined {
  for (const selector of selectors) {
    const element = root.querySelector(selector);
    if (element && !isElementHidden(element)) {
      const text = compactText(element.textContent ?? "");
      if (text) return text;
    }
  }
  return undefined;
}

function contentRoot(message: Element, role: "user" | "assistant"): Element {
  if (role === "assistant")
    return (
      message.querySelector('[data-markdown-text-style="assistant-message"]') ??
      message
    );
  return (
    message.querySelector(".whitespace-pre-wrap") ??
    message.querySelector('[class*="whitespace-pre-wrap"]') ??
    message
  );
}

function extractMessage({
  id,
  role,
  element,
}: PageMessage): ExportMessage | null {
  if (isElementHidden(element)) {
    return null;
  }

  const attachments = collectAttachments(element);
  const placeholderFileIds = new Set(
    [...(element.textContent ?? "").matchAll(/\{\{file:([^}]+)\}\}/gu)].map(
      (match) => (match[1] ?? "").trim(),
    ),
  );
  const root = contentRoot(element, role);
  const context: ConversionContext = {
    citations: [],
    placeholderFileIds,
    preserveTextWhitespace:
      role === "user" && root.classList.contains("whitespace-pre-wrap"),
  };
  const main = normalizeBlocks(convertChildren(root, context));
  const preamble: string[] = [];
  if (role === "user") {
    for (const card of element.querySelectorAll(SELECTORS.attachment)) {
      const name = compactText(card.getAttribute("aria-label") ?? "");
      if (name) preamble.push(`[附件：${name}]`);
    }
  }
  const targetedReply = visibleText(element, SELECTORS.targetedReply);
  if (targetedReply) preamble.push(blockquote(targetedReply));
  const reasoning = visibleText(element, SELECTORS.reasoningSummary);
  if (reasoning) preamble.push(`> **思考摘要**\n>\n${blockquote(reasoning)}`);
  const markdown = normalizeBlocks(
    replaceFilePlaceholders(
      [...preamble, main].filter(Boolean).join("\n\n"),
      attachments,
    ),
  );
  if (!markdown) return null;

  const model = element.getAttribute("data-message-model-slug")?.trim();
  return {
    id,
    role,
    markdown,
    citations: context.citations,
    ...(model ? { model } : {}),
  };
}

function conversationTitle(documentNode: Document): string {
  const pageTitle = documentNode.title
    .replace(/\s*[|–—-]\s*ChatGPT\s*$/iu, "")
    .trim();
  return pageTitle || "ChatGPT 对话";
}

export function extractVisibleConversation(
  documentNode: Document,
): ExtractedConversation {
  const messages = pageMessages(documentNode)
    .map(extractMessage)
    .filter((message): message is ExportMessage => message !== null);
  return { title: conversationTitle(documentNode), messages };
}

export function visibleBranchHints(documentNode: Document): {
  visibleMessageIds: string[];
  visibleTurnIds: string[];
} {
  return {
    visibleMessageIds: pageMessages(documentNode).map(({ id }) => id),
    visibleTurnIds: allMatches(documentNode, SELECTORS.turns)
      .map((element) => element.getAttribute("data-turn-key"))
      .filter((id): id is string => Boolean(id)),
  };
}
