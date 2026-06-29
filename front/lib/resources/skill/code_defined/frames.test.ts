import { framesSkill } from "@app/lib/resources/skill/code_defined/frames";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

// Marker only present in the computer-first variant of the Frames instructions.
const COMPUTER_FIRST_MARKER = "preferred: edit in the Computer";

describe("framesSkill.fetchInstructions", () => {
  it("teaches the computer-first flow when frame_publish and the Computer are both enabled", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "frame_publish");
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).toContain(
      "/files/conversation-<conversationId>/<FrameName>.tsx"
    );
    expect(instructions).toContain("publish_interactive_content_file");
  });

  it("falls back to the retrieve and edit flow when frame_publish is off", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).not.toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).toContain("### Updating Existing Files:");
  });

  it("falls back when frame_publish is on but the Computer is unavailable", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "frame_publish");

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).not.toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).toContain("### Updating Existing Files:");
  });
});
