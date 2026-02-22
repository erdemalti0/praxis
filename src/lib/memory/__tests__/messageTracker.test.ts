import { describe, it, expect } from "vitest";
import { MessageTracker } from "../messageTracker";

describe("MessageTracker", () => {
  it("addPointer creates pointer with correct fields", () => {
    const tracker = new MessageTracker();
    tracker.addPointer("msg-1", "Fixed the authentication bug in login flow");

    const pointers = tracker.getPointers();
    expect(pointers).toHaveLength(1);
    expect(pointers[0].messageId).toBe("msg-1");
    expect(pointers[0].contentHash).toBeDefined();
    expect(pointers[0].timestamp).toBeGreaterThan(0);
  });

  it("contentHash is 8 characters", () => {
    const tracker = new MessageTracker();
    tracker.addPointer("msg-1", "Some content here for hashing");

    const pointers = tracker.getPointers();
    expect(pointers[0].contentHash).toHaveLength(8);
  });

  it("detectCategoryHint returns error for error-related content", () => {
    const tracker = new MessageTracker();
    tracker.addPointer("msg-1", "Fixed the error in the authentication module");

    const pointers = tracker.getPointers();
    expect(pointers[0].categoryHint).toBe("error");
  });

  it("detectCategoryHint returns decision for decision-related content", () => {
    const tracker = new MessageTracker();
    tracker.addPointer("msg-1", "We decided to use PostgreSQL for the database");

    const pointers = tracker.getPointers();
    expect(pointers[0].categoryHint).toBe("decision");
  });

  it("detectCategoryHint returns null for generic content", () => {
    const tracker = new MessageTracker();
    tracker.addPointer("msg-1", "Hello world this is a simple message");

    const pointers = tracker.getPointers();
    expect(pointers[0].categoryHint).toBeNull();
  });

  it("getPointers returns all accumulated pointers", () => {
    const tracker = new MessageTracker();
    tracker.addPointer("msg-1", "First message");
    tracker.addPointer("msg-2", "Second message");
    tracker.addPointer("msg-3", "Third message");

    expect(tracker.getPointers()).toHaveLength(3);
    expect(tracker.getPointerCount()).toBe(3);
  });

  it("clear empties all pointers", () => {
    const tracker = new MessageTracker();
    tracker.addPointer("msg-1", "Some content");
    tracker.addPointer("msg-2", "More content");

    tracker.clear();
    expect(tracker.getPointers()).toHaveLength(0);
    expect(tracker.getPointerCount()).toBe(0);
  });

  it("getPointers returns a copy (not the internal array)", () => {
    const tracker = new MessageTracker();
    tracker.addPointer("msg-1", "Content");

    const pointers1 = tracker.getPointers();
    const pointers2 = tracker.getPointers();
    expect(pointers1).not.toBe(pointers2);
    expect(pointers1).toEqual(pointers2);
  });
});
