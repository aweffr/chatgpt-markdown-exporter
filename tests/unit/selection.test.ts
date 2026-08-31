import { describe, expect, it } from "vitest";

import { SelectionState } from "../../src/selection-state";

describe("SelectionState", () => {
  it("starts selected and supports individual, all, and none changes", () => {
    const state = new SelectionState(["one", "two", "three"]);
    expect(state.count).toBe(3);

    state.set("two", false);
    expect([...state.selected]).toEqual(["one", "three"]);

    state.selectNone();
    expect(state.count).toBe(0);

    state.selectAll();
    expect([...state.selected]).toEqual(["one", "two", "three"]);
  });
});
