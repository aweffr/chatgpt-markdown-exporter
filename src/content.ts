import {
  conversationIdFromLocation,
  loadCurrentConversation,
  type LoadConversationResult,
} from "./conversation-client";
import { createDownloadRequest, type DownloadResponse } from "./download";
import { renderMarkdown } from "./markdown";
import { firstMatch, pageMessages, SELECTORS } from "./selectors";
import { SelectionState } from "./selection-state";
import type { ExportMessage, ExtractedConversation } from "./types";

const HOST_ATTRIBUTE = "data-chatgpt-markdown-exporter";
const Z_INDEX = "2147483000";

interface SelectionControl {
  host: HTMLElement;
  input: HTMLInputElement;
  messageElement: HTMLElement;
}

function buttonStyles(): string {
  return `
    :host { position: absolute; inset-inline-start: calc(100% + 8px); inset-block-start: 50%; z-index: ${Z_INDEX}; display: inline-flex; align-items: center; transform: translateY(-50%); }
    *, *::before, *::after { box-sizing: border-box; }
    .wrap { position: relative; display: inline-flex; align-items: center; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    button { min-height: 36px; border: 1px solid #d1d5db; border-radius: 10px; padding: 7px 12px; background: #fff; color: #111827; font: 600 14px/1.2 inherit; white-space: nowrap; cursor: pointer; }
    button:hover { background: #f3f4f6; }
    button:focus-visible { outline: 2px solid #0f766e; outline-offset: 2px; }
    button:disabled { cursor: default; opacity: .55; }
    .error { position: absolute; inset-block-start: calc(100% + 4px); inset-inline-end: 0; width: max-content; max-width: 260px; color: #b91c1c; font-size: 13px; line-height: 1.35; }
    @media (prefers-color-scheme: dark) {
      button { border-color: #4b5563; background: #212121; color: #f9fafb; }
      button:hover { background: #303030; }
      .error { color: #fca5a5; }
    }
  `;
}

function toolbarStyles(): string {
  return `
    :host { position: fixed; inset-inline: 0; bottom: 0; z-index: ${Z_INDEX}; display: flex; justify-content: center; pointer-events: none; }
    *, *::before, *::after { box-sizing: border-box; }
    .bar { pointer-events: auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; margin: 12px; margin-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 14px; background: #fff; color: #111827; box-shadow: 0 4px 12px rgb(0 0 0 / 0.14); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    button { min-height: 36px; border: 1px solid #d1d5db; border-radius: 9px; padding: 7px 11px; background: #fff; color: #111827; font: 600 14px/1.2 inherit; cursor: pointer; }
    button:hover { background: #f3f4f6; }
    button:focus-visible { outline: 2px solid #0f766e; outline-offset: 2px; }
    button.primary { border-color: #0f766e; background: #0f766e; color: #fff; }
    button.primary:hover { background: #115e59; }
    button:disabled { cursor: default; opacity: .5; }
    output { min-width: 88px; text-align: center; font-size: 14px; font-variant-numeric: tabular-nums; }
    .error { flex-basis: 100%; margin: 0; color: #b91c1c; font-size: 13px; text-align: center; }
    @media (prefers-color-scheme: dark) {
      .bar { border-color: #4b5563; background: #212121; color: #f9fafb; }
      button { border-color: #4b5563; background: #212121; color: #f9fafb; }
      button:hover { background: #303030; }
      button.primary { border-color: #0d9488; background: #0d9488; }
      .error { color: #fca5a5; }
    }
  `;
}

function checkboxStyles(): string {
  return `
    :host { position: absolute; inset-block-start: 10px; inset-inline-start: -38px; z-index: ${Z_INDEX}; }
    label { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid #d1d5db; border-radius: 9px; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 0.12); cursor: pointer; }
    input { width: 18px; height: 18px; margin: 0; accent-color: #0f766e; cursor: pointer; }
    input:focus-visible { outline: 2px solid #0f766e; outline-offset: 3px; }
    @media (max-width: 720px) { :host { inset-inline-start: 6px; } }
    @media (prefers-color-scheme: dark) { label { border-color: #4b5563; background: #212121; } }
  `;
}

function createShadowHost(kind: string): {
  host: HTMLElement;
  root: ShadowRoot;
} {
  const host = document.createElement("span");
  host.setAttribute(HOST_ATTRIBUTE, kind);
  return { host, root: host.attachShadow({ mode: "open" }) };
}

function currentMessageElements(): Map<string, Element> {
  return new Map(
    pageMessages(document).map(({ id, element }) => [id, element]),
  );
}

async function downloadMarkdown(
  title: string,
  markdown: string,
): Promise<void> {
  const response = (await chrome.runtime.sendMessage(
    createDownloadRequest(title, markdown),
  )) as DownloadResponse | undefined;
  if (!response?.ok)
    throw new Error(response?.error || "Markdown 下载失败，请重试");
}

class ExporterApp {
  private routeKey = "";
  private exportHost: HTMLElement | null = null;
  private exportButton: HTMLButtonElement | null = null;
  private exportError: HTMLElement | null = null;
  private exportAnchor: HTMLElement | null = null;
  private exportAnchorPreviousPosition: string | null = null;
  private conversationLoad: Promise<LoadConversationResult> | null = null;
  private conversationCache: LoadConversationResult | null = null;
  private prefetchedRouteKey = "";
  private selection: SelectionState | null = null;
  private conversation: ExtractedConversation | null = null;
  private controls = new Map<string, SelectionControl>();
  private toolbarHost: HTMLElement | null = null;
  private selectedOutput: HTMLOutputElement | null = null;
  private exportSelectionButton: HTMLButtonElement | null = null;
  private toolbarError: HTMLElement | null = null;
  private mutationQueued = false;

  start(): void {
    this.syncRoute();
    const observer = new MutationObserver(() => this.queueSync());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    window.addEventListener("popstate", () => this.syncRoute());
    window.setInterval(() => this.syncRoute(), 500);
  }

  private queueSync(): void {
    if (this.mutationQueued) return;
    this.mutationQueued = true;
    window.setTimeout(() => {
      this.mutationQueued = false;
      this.syncRoute();
      this.checkSelectionSurface();
    }, 100);
  }

  private syncRoute(): void {
    const conversationId = conversationIdFromLocation();
    const nextRouteKey = conversationId
      ? `${location.origin}/c/${conversationId}`
      : "";
    if (nextRouteKey !== this.routeKey) {
      this.exitSelection();
      this.removeExportButton();
      this.routeKey = nextRouteKey;
      this.conversationLoad = null;
      this.conversationCache = null;
      this.prefetchedRouteKey = "";
    }
    if (!conversationId) {
      this.removeExportButton();
      return;
    }
    if (!this.exportHost?.isConnected) this.mountExportButton();
    if (currentMessageElements().size > 0) this.prefetchConversation();
  }

  private composerContainer(): HTMLElement | null {
    const match = firstMatch(document, SELECTORS.composer);
    return match instanceof HTMLElement ? match : null;
  }

  private mountExportButton(): void {
    const composer = this.composerContainer();
    if (!composer) return;
    const { host, root } = createShadowHost("entry");
    root.innerHTML = `
      <style>${buttonStyles()}</style>
      <div class="wrap">
        <button type="button">导出</button>
        <span class="error" role="status" aria-live="polite"></span>
      </div>`;
    const button = root.querySelector("button");
    const error = root.querySelector<HTMLElement>(".error");
    if (!button || !error) return;
    button.addEventListener("click", () => void this.enterSelection());
    if (getComputedStyle(composer).position === "static") {
      this.exportAnchorPreviousPosition = composer.style.position;
      composer.style.position = "relative";
    }
    composer.append(host);
    this.exportAnchor = composer;
    this.exportHost = host;
    this.exportButton = button;
    this.exportError = error;
  }

  private removeExportButton(): void {
    this.exportHost?.remove();
    this.exportHost = null;
    this.exportButton = null;
    this.exportError = null;
    if (this.exportAnchor && this.exportAnchorPreviousPosition !== null) {
      this.exportAnchor.style.position = this.exportAnchorPreviousPosition;
    }
    this.exportAnchor = null;
    this.exportAnchorPreviousPosition = null;
  }

  private ensureConversationLoad(): Promise<LoadConversationResult> {
    if (this.conversationCache) return Promise.resolve(this.conversationCache);
    if (this.conversationLoad) return this.conversationLoad;
    const routeKey = this.routeKey;
    const promise = loadCurrentConversation(document)
      .then((result) => {
        if (this.routeKey === routeKey) this.conversationCache = result;
        return result;
      })
      .finally(() => {
        if (this.conversationLoad === promise) this.conversationLoad = null;
      });
    this.conversationLoad = promise;
    return promise;
  }

  private prefetchConversation(): void {
    if (!this.routeKey || this.prefetchedRouteKey === this.routeKey) return;
    this.prefetchedRouteKey = this.routeKey;
    void this.ensureConversationLoad().catch((error: unknown) => {
      console.info("[ChatGPT Markdown 导出器] 后台预读取未完成", {
        stage: "conversation-prefetch",
        reason: error instanceof Error ? error.message : "unknown error",
      });
    });
  }

  private invalidateConversationLoad(): void {
    this.conversationCache = null;
    this.conversationLoad = null;
    this.prefetchedRouteKey = "";
  }

  private showEntryError(message: string): void {
    if (this.exportError) this.exportError.textContent = message;
  }

  private isGenerating(): boolean {
    return firstMatch(document, SELECTORS.generating) !== null;
  }

  private async enterSelection(): Promise<void> {
    if (this.selection) return;
    this.showEntryError("");
    if (this.isGenerating()) {
      this.showEntryError("回答生成完成后可导出");
      return;
    }
    if (!this.exportButton) return;
    this.exportButton.disabled = true;
    this.exportButton.textContent = "加载中…";
    try {
      let result = await this.ensureConversationLoad();
      const pageIds = currentMessageElements();
      const conversationIds = new Set(
        result.conversation.messages.map((message) => message.id),
      );
      if ([...pageIds.keys()].some((id) => !conversationIds.has(id))) {
        this.invalidateConversationLoad();
        result = await this.ensureConversationLoad();
      }
      const messages = result.conversation.messages;
      const refreshedIds = new Set(messages.map((message) => message.id));
      if (
        messages.length === 0 ||
        [...pageIds.keys()].some((id) => !refreshedIds.has(id))
      ) {
        throw new Error("页面消息已变化，请重试");
      }
      this.conversation = result.conversation;
      this.selection = new SelectionState(
        messages.map((message) => message.id),
      );
      this.mountSelectionControls(messages, pageIds);
      this.mountToolbar();
      this.exportButton.textContent = "选择中";
      console.info("[ChatGPT Markdown 导出器] 已进入选择模式", {
        stage: "selection-ready",
        source: result.source,
        messageCount: messages.length,
      });
    } catch (error) {
      this.showEntryError(
        error instanceof Error ? error.message : "无法读取当前对话",
      );
      this.exportButton.disabled = false;
      this.exportButton.textContent = "导出";
    }
  }

  private mountSelectionControls(
    messages: readonly ExportMessage[],
    elements: ReadonlyMap<string, Element>,
  ): void {
    messages.forEach((message, index) => {
      if (this.controls.has(message.id)) return;
      const messageElement = elements.get(message.id);
      if (!(messageElement instanceof HTMLElement)) return;
      const { host, root } = createShadowHost("message-selector");
      root.innerHTML = `
        <style>${checkboxStyles()}</style>
        <label>
          <input type="checkbox" checked aria-label="选择第 ${index + 1} 条消息">
        </label>`;
      const input = root.querySelector("input");
      if (!input) return;
      input.checked = this.selection?.selected.has(message.id) ?? true;
      if (getComputedStyle(messageElement).position === "static") {
        messageElement.dataset.exporterPreviousPosition =
          messageElement.style.position;
        messageElement.style.position = "relative";
      }
      input.addEventListener("change", () => {
        this.selection?.set(message.id, input.checked);
        this.updateToolbar();
      });
      messageElement.prepend(host);
      this.controls.set(message.id, { host, input, messageElement });
    });
  }

  private mountToolbar(): void {
    const { host, root } = createShadowHost("toolbar");
    root.innerHTML = `
      <style>${toolbarStyles()}</style>
      <div class="bar" role="toolbar" aria-label="Markdown 导出选择工具栏">
        <button type="button" data-action="all">全选</button>
        <button type="button" data-action="none">全不选</button>
        <output aria-live="polite"></output>
        <button type="button" class="primary" data-action="export">导出 Markdown</button>
        <button type="button" data-action="cancel">取消</button>
        <p class="error" role="status" aria-live="polite"></p>
      </div>`;
    const allButton = root.querySelector<HTMLButtonElement>(
      '[data-action="all"]',
    );
    const noneButton = root.querySelector<HTMLButtonElement>(
      '[data-action="none"]',
    );
    const exportButton = root.querySelector<HTMLButtonElement>(
      '[data-action="export"]',
    );
    const cancelButton = root.querySelector<HTMLButtonElement>(
      '[data-action="cancel"]',
    );
    const output = root.querySelector<HTMLOutputElement>("output");
    const error = root.querySelector<HTMLElement>(".error");
    if (
      !allButton ||
      !noneButton ||
      !exportButton ||
      !cancelButton ||
      !output ||
      !error
    ) {
      return;
    }
    allButton.addEventListener("click", () => {
      this.selection?.selectAll();
      this.syncCheckboxes();
    });
    noneButton.addEventListener("click", () => {
      this.selection?.selectNone();
      this.syncCheckboxes();
    });
    exportButton.addEventListener("click", () => void this.exportSelected());
    cancelButton.addEventListener("click", () => this.exitSelection());
    document.body.append(host);
    this.toolbarHost = host;
    this.selectedOutput = output;
    this.exportSelectionButton = exportButton;
    this.toolbarError = error;
    this.updateToolbar();
  }

  private syncCheckboxes(): void {
    const selected = this.selection?.selected;
    if (!selected) return;
    for (const [id, control] of this.controls) {
      control.input.checked = selected.has(id);
    }
    this.updateToolbar();
  }

  private updateToolbar(): void {
    if (!this.selection || !this.selectedOutput || !this.exportSelectionButton)
      return;
    this.selectedOutput.textContent = `已选 ${this.selection.count} / ${this.selection.ids.length}`;
    this.exportSelectionButton.disabled = this.selection.count === 0;
  }

  private async exportSelected(): Promise<void> {
    if (!this.selection || !this.conversation || this.selection.count === 0)
      return;
    if (this.isGenerating()) {
      if (this.toolbarError)
        this.toolbarError.textContent = "回答生成完成后可导出";
      return;
    }
    try {
      const markdown = renderMarkdown(
        this.conversation.title,
        this.conversation.messages,
        this.selection.selected,
      );
      await downloadMarkdown(this.conversation.title, markdown);
      this.exitSelection();
    } catch (error) {
      if (this.toolbarError) {
        this.toolbarError.textContent =
          error instanceof Error ? error.message : "Markdown 下载失败，请重试";
      }
    }
  }

  private checkSelectionSurface(): void {
    if (!this.selection || !this.conversation) return;
    const current = currentMessageElements();
    const selectedIds = new Set(this.selection.ids);
    if ([...current.keys()].some((id) => !selectedIds.has(id))) {
      this.exitSelection();
      this.invalidateConversationLoad();
      this.prefetchConversation();
      return;
    }
    for (const [id, control] of this.controls) {
      const stale =
        !control.messageElement.isConnected ||
        current.get(id) !== control.messageElement;
      if (!stale) continue;
      this.removeSelectionControl(id, control);
    }
    this.mountSelectionControls(this.conversation.messages, current);
  }

  private removeSelectionControl(id: string, control: SelectionControl): void {
    control.host.remove();
    const previous = control.messageElement.dataset.exporterPreviousPosition;
    if (previous !== undefined) {
      control.messageElement.style.position = previous;
      delete control.messageElement.dataset.exporterPreviousPosition;
    }
    this.controls.delete(id);
  }

  private exitSelection(): void {
    for (const [id, control] of [...this.controls]) {
      this.removeSelectionControl(id, control);
    }
    this.toolbarHost?.remove();
    this.toolbarHost = null;
    this.selectedOutput = null;
    this.exportSelectionButton = null;
    this.toolbarError = null;
    this.selection = null;
    this.conversation = null;
    if (this.exportButton) {
      this.exportButton.disabled = false;
      this.exportButton.textContent = "导出";
    }
  }
}

new ExporterApp().start();
