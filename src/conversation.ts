import { apiMessageFromNode } from "./api-message";
import { createCitationToken } from "./markdown";
import { enrichVisibleMessage } from "./message-enrichment";
import type {
  ConversationNode,
  ConversationPayload,
  ExportMessage,
  ExtractedConversation,
  VisibleBranchHints,
} from "./types";

export class ConversationAlignmentError extends Error {
  constructor() {
    super("API and page messages do not match");
    this.name = "ConversationAlignmentError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isConversationPayload(value: unknown): value is ConversationPayload {
  return isRecord(value) && isRecord(value.mapping);
}

function findConversationPayload(value: unknown): ConversationPayload | null {
  const visited = new Set<object>();
  const queue: unknown[] = [value];
  while (queue.length) {
    const current = queue.shift();
    if (isConversationPayload(current)) return current;
    if (typeof current !== "object" || current === null || visited.has(current))
      continue;
    visited.add(current);
    queue.push(...(Array.isArray(current) ? current : Object.values(current)));
  }
  return null;
}

function restoreCompactArray(table: readonly unknown[]): unknown {
  const cache = new Map<number, unknown>();
  const special = new Map<number, unknown>([
    [-1, Number.NaN],
    [-2, Number.POSITIVE_INFINITY],
    [-3, Number.NEGATIVE_INFINITY],
    [-4, -0],
    [-5, undefined],
  ]);
  const expandValue = (value: unknown): unknown => {
    if (typeof value === "number") {
      return value < 0 ? special.get(value) : expandReference(value);
    }
    if (Array.isArray(value)) return value.map(expandValue);
    if (!isRecord(value)) return value;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const keyReference = /^_(\d+)$/u.exec(key);
      const expandedKey = keyReference
        ? String(expandReference(Number(keyReference[1])))
        : key;
      result[expandedKey] = expandValue(item);
    }
    return result;
  };
  const expandReference = (index: number): unknown => {
    if (cache.has(index)) return cache.get(index);
    const value = table[index];
    if (!isRecord(value) && !Array.isArray(value)) return value;
    if (Array.isArray(value)) {
      const target: unknown[] = [];
      cache.set(index, target);
      target.push(...value.map(expandValue));
      return target;
    }
    const target: Record<string, unknown> = {};
    cache.set(index, target);
    for (const [key, item] of Object.entries(value)) {
      const keyReference = /^_(\d+)$/u.exec(key);
      const expandedKey = keyReference
        ? String(expandReference(Number(keyReference[1])))
        : key;
      target[expandedKey] = expandValue(item);
    }
    return target;
  };
  return expandReference(0);
}

export function normalizeConversationPayload(
  value: unknown,
): ConversationPayload {
  const direct = findConversationPayload(value);
  if (direct) return direct;
  if (Array.isArray(value)) {
    const restored = findConversationPayload(restoreCompactArray(value));
    if (restored) return restored;
  }
  throw new Error("Unsupported conversation response");
}

function lastMatchingId(
  ids: readonly string[],
  mapping: Record<string, ConversationNode>,
): string | undefined {
  for (let index = ids.length - 1; index >= 0; index -= 1) {
    const id = ids[index];
    if (id && mapping[id]) return id;
  }
  return undefined;
}

function followLastChild(
  startId: string,
  mapping: Record<string, ConversationNode>,
): string {
  let currentId = startId;
  const visited = new Set<string>();

  while (!visited.has(currentId)) {
    visited.add(currentId);
    const children = mapping[currentId]?.children ?? [];
    const nextId = [...children].reverse().find((id) => Boolean(mapping[id]));
    if (!nextId) return currentId;
    currentId = nextId;
  }

  return currentId;
}

export function reconstructActiveBranch(
  payload: ConversationPayload,
  hints: VisibleBranchHints,
): ConversationNode[] {
  const { mapping } = payload;
  const hintedId =
    lastMatchingId(hints.visibleMessageIds, mapping) ??
    lastMatchingId(hints.visibleTurnIds, mapping);
  const startId = hintedId ?? payload.current_node;
  if (!startId || !mapping[startId]) {
    throw new Error("Conversation has no active branch");
  }

  let currentId: string | null | undefined = followLastChild(startId, mapping);
  const branch: ConversationNode[] = [];
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const current: ConversationNode | undefined = mapping[currentId];
    if (!current) break;
    const role = current.message?.author?.role;
    if (role === "user" || role === "assistant") branch.push(current);
    currentId = current.parent;
  }

  return branch.reverse();
}

function branchMessageId(node: ConversationNode): string | undefined {
  return node.message?.id ?? node.id;
}

function citationKey(urlValue: string): string {
  try {
    const url = new URL(urlValue);
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_")) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return urlValue;
  }
}

function mergeVisibleMessage(
  visible: ExportMessage,
  api: ExportMessage | null,
  node: ConversationNode,
): ExportMessage {
  const enriched = enrichVisibleMessage(visible, node);
  if (!api) return enriched;
  const citations = [...enriched.citations];
  const knownSources = new Set(
    citations.map((citation) => citationKey(citation.url)),
  );
  const addedTokens: string[] = [];
  for (const citation of api.citations) {
    const key = citationKey(citation.url);
    if (knownSources.has(key)) continue;
    knownSources.add(key);
    const index = citations.push(citation) - 1;
    addedTokens.push(createCitationToken(index));
  }
  const model = enriched.model ?? api.model;
  return {
    ...enriched,
    markdown: addedTokens.length
      ? `${enriched.markdown.trimEnd()}\n\n${addedTokens.join(" ")}`
      : enriched.markdown,
    citations,
    ...(model ? { model } : {}),
  };
}

export function alignVisibleMessagesToBranch(
  branch: readonly ConversationNode[],
  visible: ExtractedConversation,
): ExportMessage[] {
  const visibleById = new Map(
    visible.messages.map((message) => [message.id, message]),
  );
  const branchIds = branch
    .map(branchMessageId)
    .filter((id): id is string => Boolean(id));
  const branchIdSet = new Set(branchIds);
  if (visible.messages.some((message) => !branchIdSet.has(message.id))) {
    throw new ConversationAlignmentError();
  }
  return branchIds
    .map((id) => visibleById.get(id))
    .filter((message): message is ExportMessage => Boolean(message));
}

export function completeConversationFromPayload(
  payload: ConversationPayload,
  visible: ExtractedConversation,
  hints: VisibleBranchHints,
): ExtractedConversation {
  const branch = reconstructActiveBranch(payload, hints);
  const branchIds = new Set(
    branch.map(branchMessageId).filter((id): id is string => Boolean(id)),
  );
  if (visible.messages.some((message) => !branchIds.has(message.id))) {
    throw new ConversationAlignmentError();
  }
  const visibleById = new Map(
    visible.messages.map((message) => [message.id, message]),
  );
  const messages = branch
    .map((node) => {
      const id = branchMessageId(node) ?? "";
      const api = apiMessageFromNode(node);
      const rendered = visibleById.get(id);
      return rendered ? mergeVisibleMessage(rendered, api, node) : api;
    })
    .filter((message): message is ExportMessage => Boolean(message));
  if (messages.length === 0) throw new ConversationAlignmentError();
  return {
    title: payload.title?.trim() || visible.title,
    messages,
  };
}
