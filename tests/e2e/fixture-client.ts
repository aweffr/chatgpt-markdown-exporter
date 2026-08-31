const conversation = document.querySelector<HTMLElement>("#conversation");
const fullMarkup = conversation?.innerHTML ?? "";

if (location.pathname.endsWith("/virtualized") && conversation) {
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

document.querySelector("#route")?.addEventListener("click", () => {
  history.pushState({}, "", "/c/another-conversation");
  document.title = "另一个测试对话 | ChatGPT";
});

document.querySelector("#generating")?.addEventListener("click", () => {
  const existing = document.querySelector('[data-testid="stop-button"]');
  if (existing) {
    existing.remove();
    return;
  }
  const stopButton = document.createElement("button");
  stopButton.type = "button";
  stopButton.dataset.testid = "stop-button";
  stopButton.textContent = "停止生成";
  document.querySelector("form > div")?.append(stopButton);
});
