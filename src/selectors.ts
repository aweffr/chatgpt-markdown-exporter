export const SELECTORS = {
  messages: [
    "div[data-message-id]",
    "[data-message-id][data-message-author-role]",
  ],
  turns: ["section[data-turn-id]", '[data-testid^="conversation-turn-"]'],
  composer: ["form > div:has(textarea)", '[data-testid="composer-plus-btn"]'],
  domMessageContainers: ["div.group\\/turn-messages"],
  citation: '[data-testid="webpage-citation-pill"]',
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
