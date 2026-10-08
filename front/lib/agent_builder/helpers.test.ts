import { getAgentNameFormatErrorCode } from "@app/lib/agent_builder/helpers";
import { AGENT_NAME_MAX_LENGTH } from "@app/types/assistant/agent";
import { describe, expect, it } from "vitest";

describe("getAgentNameFormatErrorCode", () => {
  it("rejects an empty name", () => {
    expect(getAgentNameFormatErrorCode("")).toBe("empty");
  });

  it("rejects names longer than the maximum", () => {
    expect(
      getAgentNameFormatErrorCode("A".repeat(AGENT_NAME_MAX_LENGTH + 1))
    ).toBe("too_long");
  });

  it("accepts a name at the maximum length", () => {
    expect(getAgentNameFormatErrorCode("A".repeat(AGENT_NAME_MAX_LENGTH))).toBe(
      null
    );
  });

  it("rejects names that contain spaces", () => {
    expect(getAgentNameFormatErrorCode("My Agent")).toBe("contains_spaces");
  });
});
