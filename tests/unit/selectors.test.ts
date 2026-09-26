import { describe, expect, it } from "vitest";

import { allMatches, SELECTORS } from "../../src/selectors";

describe("allMatches", () => {
  it("preserves document order when finding message units", () => {
    document.body.innerHTML = `
      <article data-chatgpt-search-message-ids="first" data-chatgpt-search-unit-key="turn:user"></article>
      <div data-chatgpt-search-message-ids="second" data-chatgpt-search-unit-key="turn:assistant"></div>`;

    expect(
      allMatches(document, SELECTORS.messages).map((element) =>
        element.getAttribute("data-chatgpt-search-message-ids"),
      ),
    ).toEqual(["first", "second"]);
  });
});
