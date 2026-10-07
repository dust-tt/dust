import { getAgentNameFormatError } from "@app/lib/agent_builder/helpers";
import { AGENT_NAME_MAX_LENGTH } from "@app/types/assistant/agent";
import { describe, expect, it } from "vitest";

describe("getAgentNameFormatError", () => {
  it("rejects an empty name", () => {
    expect(getAgentNameFormatError("")).toBe("Agent name cannot be empty.");
  });

  it("rejects names longer than the maximum", () => {
    expect(getAgentNameFormatError("A".repeat(AGENT_NAME_MAX_LENGTH + 1))).toBe(
      `Agent name must be at most ${AGENT_NAME_MAX_LENGTH} characters.`
    );
  });

  it("accepts a name at the maximum length", () => {
    expect(getAgentNameFormatError("A".repeat(AGENT_NAME_MAX_LENGTH))).toBe(
      null
    );
  });

  it("rejects names that contain spaces", () => {
    expect(getAgentNameFormatError("My Agent")).toBe(
      "Agent name cannot contain spaces."
    );
  });
});
