import { useLiveParticipants } from "@app/components/editor/document/useLiveParticipants";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as Y from "yjs";

const awarenesses: Awareness[] = [];

const newAwareness = (user?: unknown) => {
  const awareness = new Awareness(new Y.Doc());
  awarenesses.push(awareness);
  if (user !== undefined) {
    awareness.setLocalStateField("user", user);
  }
  return awareness;
};

// What the session relays from another client.
const receive = (local: Awareness, remote: Awareness) =>
  act(() =>
    applyAwarenessUpdate(
      local,
      encodeAwarenessUpdate(remote, [remote.clientID]),
      "remote"
    )
  );

describe("useLiveParticipants", () => {
  afterEach(() => {
    awarenesses.splice(0).forEach((awareness) => awareness.destroy());
  });

  it("lists the current user first, then the others once each, in the order they joined", () => {
    const local = newAwareness();
    const { result } = renderHook(() => useLiveParticipants(local));
    expect(result.current).toEqual([]);

    receive(local, newAwareness({ id: "bob", name: "Bob", color: "#111" }));
    receive(local, newAwareness({ id: "ada", name: "Ada", color: "#222" }));
    receive(local, newAwareness({ id: "bob", name: "Bob", color: "#111" }));
    receive(local, newAwareness({ id: "me", name: "Me", color: "#000" }));
    act(() =>
      local.setLocalStateField("user", { id: "me", name: "Me", color: "#000" })
    );

    expect(result.current).toEqual([
      { id: "me", name: "Me" },
      { id: "bob", name: "Bob" },
      { id: "ada", name: "Ada" },
    ]);
  });

  it("ignores states without a user id", () => {
    const local = newAwareness();
    const { result } = renderHook(() => useLiveParticipants(local));

    receive(local, newAwareness({ name: "Anonymous", color: "#111" }));
    receive(local, newAwareness({ id: "", name: "Empty", color: "#111" }));

    expect(result.current).toEqual([]);
  });

  it("drops a user once their editor leaves", () => {
    const local = newAwareness();
    const bob = newAwareness({ id: "bob", name: "Bob", color: "#111" });
    const { result } = renderHook(() => useLiveParticipants(local));
    receive(local, bob);
    expect(result.current).toEqual([{ id: "bob", name: "Bob" }]);

    act(() => removeAwarenessStates(local, [bob.clientID], "remote"));

    expect(result.current).toEqual([]);
  });

  it("starts with none on a new awareness, and without one", () => {
    const first = newAwareness();
    receive(first, newAwareness({ id: "bob", name: "Bob", color: "#111" }));
    const { result, rerender } = renderHook<
      ReturnType<typeof useLiveParticipants>,
      { awareness: Awareness | null }
    >(({ awareness }) => useLiveParticipants(awareness), {
      initialProps: { awareness: first },
    });
    expect(result.current).toEqual([{ id: "bob", name: "Bob" }]);

    rerender({ awareness: newAwareness() });
    expect(result.current).toEqual([]);

    rerender({ awareness: null });
    expect(result.current).toEqual([]);
  });
});
