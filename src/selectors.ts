export const SELECTORS = {
  messages: ["[data-chatgpt-search-message-ids]"],
  turns: ["[data-turn-key]"],
  composer: ["form[data-chatgpt-composer] [data-composer-surface-variant]"],
  citation: '[data-testid="chatgpt-citation"]',
  fileCitation: '[data-testid="chatgpt-library-file-citation"]',
  attachment: "button.peer\\/resource-card[aria-label]",
  generating: [
    '[data-testid="stop-button"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="停止"]',
  ],
  targetedReply: [
    "[data-export-targeted-reply]",
    '[data-testid="targeted-reply"]',
    '[data-message-component="targeted-reply"]',
  ],
  reasoningSummary: [
    "[data-export-reasoning-summary]",
    '[data-testid="reasoning-summary"]',
    '[data-message-component="reasoning-summary"]',
    '[data-testid="thought-process"]',
    '[data-message-component="thought-process"]',
    '[data-content-type="thought-process"]',
  ],
} as const;

export interface PageMessage {
  id: string;
  role: "user" | "assistant";
  element: Element;
}

// Search units can list tool IDs and duplicate answer IDs. The selection
// target identifies the rendered answer; user units carry their own ID.
export function pageMessages(root: ParentNode): PageMessage[] {
  return allMatches(root, SELECTORS.messages).flatMap((unit): PageMessage[] => {
    const answer = unit.querySelector("[data-chatgpt-selection-message-id]");
    const role = answer
      ? "assistant"
      : unit.querySelector("[data-user-message-bubble]")
        ? "user"
        : null;
    const id =
      answer?.getAttribute("data-chatgpt-selection-message-id") ??
      unit
        .getAttribute("data-chatgpt-search-message-ids")
        ?.trim()
        .split(/\s+/u)[0];
    return id && role ? [{ id, role, element: unit }] : [];
  });
}

export function firstMatch(
  root: ParentNode,
  selectors: readonly string[],
): Element | null {
  for (const selector of selectors) {
    const match = root.querySelector(selector);
    if (match) return match;
  }
  return null;
}

export function allMatches(
  root: ParentNode,
  selectors: readonly string[],
): Element[] {
  return [...root.querySelectorAll(selectors.join(", "))];
}
