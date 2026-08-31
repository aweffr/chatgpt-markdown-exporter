import { describe, expect, it } from "vitest";

import { conversationIdFromLocation } from "../../src/conversation-client";

function locationAt(pathname: string): Location {
  return { pathname } as Location;
}

describe("conversationIdFromLocation", () => {
  it("reads a regular conversation route", () => {
    expect(conversationIdFromLocation(locationAt("/c/conversation-id"))).toBe(
      "conversation-id",
    );
  });

  it("reads a conversation nested under a GPT route", () => {
    expect(
      conversationIdFromLocation(
        locationAt("/g/g-p-fixture/c/nested-conversation"),
      ),
    ).toBe("nested-conversation");
  });

  it("ignores a GPT landing page without a conversation segment", () => {
    expect(
      conversationIdFromLocation(locationAt("/g/g-p-fixture")),
    ).toBeUndefined();
  });
});
