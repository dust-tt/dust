import { framesSkill } from "@app/lib/resources/skill/code_defined/frames";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

// Marker only present in the computer-first variant of the Frames instructions.
const COMPUTER_FIRST_MARKER = "preferred: edit in the Computer";

describe("framesSkill.fetchInstructions", () => {
  it("teaches the computer-first flow when the Computer is enabled", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).toContain(
      "/files/conversation-<conversationId>/<FrameName>.tsx"
    );
    expect(instructions).toContain("publish_interactive_content_file");
  });

  it("falls back to the retrieve and edit flow when the Computer is disabled", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "disable_computer_feature");

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).not.toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).toContain("### Updating Existing Files:");
  });
});
