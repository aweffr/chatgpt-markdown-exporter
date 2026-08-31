import { describe, expect, it } from "vitest";

import { allMatches, SELECTORS } from "../../src/selectors";

describe("allMatches", () => {
  it("preserves document order across selector fallbacks", () => {
    document.body.innerHTML = `
      <article data-message-id="first" data-message-author-role="user"></article>
      <div data-message-id="second" data-message-author-role="assistant"></div>`;

    expect(
      allMatches(document, SELECTORS.messages).map((element) =>
        element.getAttribute("data-message-id"),
      ),
    ).toEqual(["first", "second"]);
  });
});
