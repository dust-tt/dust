import { groupMessagesIntoInteractions } from "@app/lib/api/assistant/conversation/interactions";
import { describe, expect, it } from "vitest";

describe("groupMessagesIntoInteractions", () => {
  type Tagged = { role: string; tag: string; gracefullyStopped?: boolean };

  const msg = (
    role: string,
    tag: string,
    gracefullyStopped?: boolean
  ): Tagged => ({ role, tag, gracefullyStopped });

  it("returns an empty array when there are no messages", () => {
    expect(groupMessagesIntoInteractions([])).toEqual([]);
  });

  it("puts a lone user message in a single interaction", () => {
    const interactions = groupMessagesIntoInteractions([msg("user", "u1")]);
    expect(interactions).toHaveLength(1);
    expect(interactions[0].messages.map((m) => m.tag)).toEqual(["u1"]);
  });

  it("keeps consecutive user and content_fragment messages in the same user turn", () => {
    const interactions = groupMessagesIntoInteractions([
      msg("content_fragment", "cf1"),
      msg("user", "u1"),
      msg("content_fragment", "cf2"),
      msg("user", "u2"),
      msg("assistant", "a1"),
      msg("function", "f1"),
      msg("function", "f2"),
    ]);
    expect(interactions).toHaveLength(1);
    expect(interactions[0].messages.map((m) => m.tag)).toEqual([
      "cf1",
      "u1",
      "cf2",
      "u2",
      "a1",
      "f1",
      "f2",
    ]);
  });

  it("starts a new interaction when a user turn follows an agent turn", () => {
    const interactions = groupMessagesIntoInteractions([
      msg("user", "u1"),
      msg("assistant", "a1"),
      msg("user", "u2"),
      msg("assistant", "a2"),
    ]);
    expect(interactions).toHaveLength(2);
    expect(interactions[0].messages.map((m) => m.tag)).toEqual(["u1", "a1"]);
    expect(interactions[1].messages.map((m) => m.tag)).toEqual(["u2", "a2"]);
  });

  it("keeps multiple consecutive agent messages in one interaction", () => {
    const interactions = groupMessagesIntoInteractions([
      msg("user", "u1"),
      msg("assistant", "a1"),
      msg("function", "f1"),
      msg("assistant", "a2"),
      msg("function", "f2"),
    ]);
    expect(interactions).toHaveLength(1);
    expect(interactions[0].messages.map((m) => m.tag)).toEqual([
      "u1",
      "a1",
      "f1",
      "a2",
      "f2",
    ]);
  });

  it("closes the interaction after the last agent message when the next message is a user turn", () => {
    const interactions = groupMessagesIntoInteractions([
      msg("user", "u1"),
      msg("assistant", "a1"),
      msg("function", "f1"),
      msg("user", "u2"),
    ]);
    expect(interactions).toHaveLength(2);
    expect(interactions[0].messages.map((m) => m.tag)).toEqual([
      "u1",
      "a1",
      "f1",
    ]);
    expect(interactions[1].messages.map((m) => m.tag)).toEqual(["u2"]);
  });

  const gracefulStopCallback = {
    isGracefullyStopped: (m: Tagged) => !!m.gracefullyStopped,
  };

  it("keeps a gracefully_stopped chain as a single interaction", () => {
    const interactions = groupMessagesIntoInteractions(
      [
        msg("user", "u1"),
        msg("assistant", "a1", true),
        msg("function", "f1"),
        msg("user", "u2"),
        msg("assistant", "a2"),
        msg("function", "f2"),
      ],
      gracefulStopCallback
    );
    expect(interactions).toHaveLength(1);
    expect(interactions[0].messages.map((m) => m.tag)).toEqual([
      "u1",
      "a1",
      "f1",
      "u2",
      "a2",
      "f2",
    ]);
  });

  it("keeps multiple gracefully_stopped segments as a single interaction", () => {
    const interactions = groupMessagesIntoInteractions(
      [
        msg("user", "u1"),
        msg("assistant", "a1", true),
        msg("function", "f1"),
        msg("user", "u2"),
        msg("assistant", "a2", true),
        msg("function", "f2"),
        msg("user", "u3"),
        msg("assistant", "a3"),
      ],
      gracefulStopCallback
    );
    expect(interactions).toHaveLength(1);
  });

  it("closes the interaction normally when agent is not gracefully stopped", () => {
    const interactions = groupMessagesIntoInteractions(
      [
        msg("user", "u1"),
        msg("assistant", "a1"),
        msg("function", "f1"),
        msg("user", "u2"),
        msg("assistant", "a2"),
      ],
      gracefulStopCallback
    );
    expect(interactions).toHaveLength(2);
    expect(interactions[0].messages.map((m) => m.tag)).toEqual([
      "u1",
      "a1",
      "f1",
    ]);
    expect(interactions[1].messages.map((m) => m.tag)).toEqual(["u2", "a2"]);
  });
});
