import { useLiveParticipants } from "@app/components/editor/document/useLiveParticipants";
import { AwarenessFactory } from "@app/tests/utils/AwarenessFactory";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Awareness } from "y-protocols/awareness";
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";

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
    AwarenessFactory.destroyAll();
  });

  it("lists the current user first, then the others once each, in the order they joined", () => {
    const local = AwarenessFactory.build();
    const { result } = renderHook(() => useLiveParticipants(local));
    expect(result.current).toEqual([]);

    receive(
      local,
      AwarenessFactory.build({
        user: { id: "bob", name: "Bob", color: "#111" },
      })
    );
    receive(
      local,
      AwarenessFactory.build({
        user: { id: "ada", name: "Ada", color: "#222" },
      })
    );
    receive(
      local,
      AwarenessFactory.build({
        user: { id: "bob", name: "Bob", color: "#111" },
      })
    );
    receive(
      local,
      AwarenessFactory.build({ user: { id: "me", name: "Me", color: "#000" } })
    );
    act(() =>
      local.setLocalStateField("user", { id: "me", name: "Me", color: "#000" })
    );

    expect(result.current).toEqual([
      { id: "me", name: "Me" },
      { id: "bob", name: "Bob" },
      { id: "ada", name: "Ada" },
    ]);
  });

  it("keeps a user's place while one of their editors stays", () => {
    const local = AwarenessFactory.build();
    const bobFirstTab = AwarenessFactory.build({
      user: { id: "bob", name: "Bob", color: "#111" },
    });
    const { result } = renderHook(() => useLiveParticipants(local));
    receive(local, bobFirstTab);
    receive(
      local,
      AwarenessFactory.build({
        user: { id: "ada", name: "Ada", color: "#222" },
      })
    );
    receive(
      local,
      AwarenessFactory.build({
        user: { id: "bob", name: "Bob", color: "#111" },
      })
    );

    act(() => removeAwarenessStates(local, [bobFirstTab.clientID], "remote"));

    expect(result.current).toEqual([
      { id: "bob", name: "Bob" },
      { id: "ada", name: "Ada" },
    ]);
  });

  it("ignores states without a user id", () => {
    const local = AwarenessFactory.build();
    const { result } = renderHook(() => useLiveParticipants(local));

    receive(
      local,
      AwarenessFactory.build({ user: { name: "Anonymous", color: "#111" } })
    );
    receive(
      local,
      AwarenessFactory.build({ user: { id: "", name: "Empty", color: "#111" } })
    );

    expect(result.current).toEqual([]);
  });

  it("drops a user once their editor leaves", () => {
    const local = AwarenessFactory.build();
    const bob = AwarenessFactory.build({
      user: { id: "bob", name: "Bob", color: "#111" },
    });
    const { result } = renderHook(() => useLiveParticipants(local));
    receive(local, bob);
    expect(result.current).toEqual([{ id: "bob", name: "Bob" }]);

    act(() => removeAwarenessStates(local, [bob.clientID], "remote"));

    expect(result.current).toEqual([]);
  });

  it("starts with none on a new awareness, and without one", () => {
    const first = AwarenessFactory.build();
    receive(
      first,
      AwarenessFactory.build({
        user: { id: "bob", name: "Bob", color: "#111" },
      })
    );
    const { result, rerender } = renderHook<
      ReturnType<typeof useLiveParticipants>,
      { awareness: Awareness | null }
    >(({ awareness }) => useLiveParticipants(awareness), {
      initialProps: { awareness: first },
    });
    expect(result.current).toEqual([{ id: "bob", name: "Bob" }]);

    rerender({ awareness: AwarenessFactory.build() });
    expect(result.current).toEqual([]);

    rerender({ awareness: null });
    expect(result.current).toEqual([]);
  });
});
