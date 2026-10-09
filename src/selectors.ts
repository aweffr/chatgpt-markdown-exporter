export const SELECTORS = {
  messages: ["[data-chatgpt-search-message-ids]"],
  turns: ["[data-turn-key]"],
  composer: ["form[data-chatgpt-composer] [data-composer-surface-variant]"],
  workspace: "[data-app-action-timeline-scroll]",
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

// Hidden workspaces remain mounted after navigation. Viewport position is
// deliberately irrelevant: mounted earlier messages still belong to this chat.
export function isDisplayed(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = view?.getComputedStyle(node);
    if (
      node.hasAttribute("hidden") ||
      node.getAttribute("aria-hidden") === "true" ||
      style?.display === "none" ||
      style?.visibility === "hidden"
    )
      return false;
  }
  return true;
}

export function pageContext(root: ParentNode): {
  root: ParentNode | null;
  composer: HTMLElement | null;
} {
  const forms = allMatches(root, ["form[data-chatgpt-composer]"]);
  const documentNode = root instanceof Document ? root : root.ownerDocument;
  const routeId =
    documentNode?.location?.pathname.match(/(?:^|\/)c\/([^/?#]+)/u)?.[1];
  const form = forms.find((element) => {
    if (!isDisplayed(element)) return false;
    const placement = element.getAttribute("data-composer-placement");
    if (placement && placement !== "thread") return false;
    const owner = element
      .querySelector("[data-above-composer-conversation-id]")
      ?.getAttribute("data-above-composer-conversation-id");
    return (
      !owner || !routeId || owner === `chatgpt:${decodeURIComponent(routeId)}`
    );
  });
  if (!form) return { root: forms.length ? null : root, composer: null };
  const surface = form.querySelector("[data-composer-surface-variant]");
  return {
    root: form.closest(SELECTORS.workspace) ?? root,
    composer:
      surface instanceof HTMLElement && isDisplayed(surface) ? surface : null,
  };
}

// Search units can list tool IDs and duplicate answer IDs. The selection
// target identifies the rendered answer; user units carry their own ID.
export function pageMessages(root: ParentNode): PageMessage[] {
  const context = pageContext(root);
  if (!context.root) return [];
  return allMatches(context.root, SELECTORS.messages)
    .filter(isDisplayed)
    .flatMap((unit): PageMessage[] => {
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
