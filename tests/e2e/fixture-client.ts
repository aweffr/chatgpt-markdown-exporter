const conversation = document.querySelector<HTMLElement>("#conversation");
const fullMarkup = conversation?.innerHTML ?? "";
const workspaceMarkup = document.querySelector("#workspace")?.innerHTML ?? "";

if (location.pathname.includes("virtualized") && conversation) {
  [...conversation.querySelectorAll(":scope > section")]
    .slice(0, 2)
    .forEach((section) => section.remove());
}

const initialMarkup = conversation?.innerHTML ?? "";

document.querySelector("#rebuild")?.addEventListener("click", () => {
  if (conversation) conversation.innerHTML = initialMarkup;
});

document.querySelector("#older")?.addEventListener("click", () => {
  if (conversation) conversation.innerHTML = fullMarkup;
});

function switchConversation(delayed = false): void {
  history.pushState({}, "", "/g/g-p-fixture/c/another-conversation");
  document.title = "另一个测试对话 | ChatGPT";
  const old = document.querySelector<HTMLElement>("#workspace");
  const portal = document.createElement("div");
  portal.dataset.aboveComposerConversationId = "chatgpt:fixture-conversation";
  old?.querySelector("form")?.prepend(portal);
  const mount = (): void => {
    if (old) old.style.display = "none";
    document.querySelector("#next-workspace")?.remove();
    const workspace = document.createElement("div");
    workspace.id = "next-workspace";
    workspace.dataset.appActionTimelineScroll = "";
    workspace.innerHTML = workspaceMarkup;
    for (const element of workspace.querySelectorAll(
      "[data-turn-key], [data-chatgpt-search-message-ids], [data-chatgpt-selection-message-id]",
    )) {
      for (const attribute of [
        "data-turn-key",
        "data-chatgpt-search-message-ids",
        "data-chatgpt-selection-message-id",
      ]) {
        const value = element.getAttribute(attribute);
        if (value) element.setAttribute(attribute, `next-${value}`);
      }
    }
    workspace.querySelector("[data-user-message-bubble]")!.textContent =
      "新会话的问题";
    document.body.append(workspace);
  };
  if (delayed) setTimeout(mount, 800);
  else mount();
}

document
  .querySelector("#route")
  ?.addEventListener("click", () => switchConversation());
document
  .querySelector("#delayed-route")
  ?.addEventListener("click", () => switchConversation(true));
document.querySelector("#back-route")?.addEventListener("click", () => {
  history.pushState({}, "", "/c/fixture-conversation");
  document.title = "导出测试对话 | ChatGPT";
  const next = document.querySelector<HTMLElement>("#next-workspace");
  if (next) next.style.display = "none";
  const old = document.querySelector<HTMLElement>("#workspace");
  if (old) old.style.display = "";
});

function toggleGenerating(): void {
  const existing = document.querySelector('[data-testid="stop-button"]');
  if (existing) {
    existing.remove();
    document.cookie = "fixtureGenerating=0; path=/";
    const revision = Number(document.cookie.match(/fixtureRevision=(\d+)/u)?.[1] ?? 0);
    document.cookie = `fixtureRevision=${revision + 1}; path=/`;
    return;
  }
  document.cookie = "fixtureGenerating=1; path=/";
  const stopButton = document.createElement("button");
  stopButton.type = "button";
  stopButton.dataset.testid = "stop-button";
  stopButton.textContent = "停止生成";
  document.querySelector("form > div")?.append(stopButton);
}

document.cookie = "fixtureGenerating=0; path=/";
document.cookie = "fixtureRevision=0; path=/";
if (new URLSearchParams(location.search).has("generating")) toggleGenerating();
document.querySelector("#generating")?.addEventListener("click", toggleGenerating);

document.querySelector("#remount-composer")?.addEventListener("click", () => {
  const template = document.createElement("template");
  template.innerHTML = workspaceMarkup;
  const form = template.content.querySelector("form")!;
  document.querySelector("#workspace form")?.replaceWith(form);
});
