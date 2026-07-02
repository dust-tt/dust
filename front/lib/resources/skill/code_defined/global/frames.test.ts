import { framesSkill } from "@app/lib/resources/skill/code_defined/global/frames";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { describe, expect, it } from "vitest";

// Markers unique to each variant of the updating section.
const COMPUTER_FIRST_MARKER =
  "mounted in the Computer at `/files/conversation-";
const FILES_FIRST_MARKER =
  "available to your file tools at `conversation-<conversationId>";

function agentLoopDataWithUseFileSystem(
  useFileSystem: boolean | undefined
): AgentLoopExecutionData {
  return {
    conversation: { metadata: { useFileSystem } },
  } as unknown as AgentLoopExecutionData;
}

describe("framesSkill.fetchInstructions", () => {
  it("teaches the computer-first flow when the Computer is enabled", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).toContain("publish_interactive_content_file");
    expect(instructions).not.toContain("edit_interactive_content_file");
  });

  it("teaches the files-tools flow when the Computer is disabled", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "disable_computer_feature");

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).not.toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).toContain(FILES_FIRST_MARKER);
    expect(instructions).toContain("files__edit");
    expect(instructions).toContain("publish_interactive_content_file");
    expect(instructions).not.toContain("edit_interactive_content_file");
  });

  it("keeps the retrieve and file-id edit flow for legacy conversations", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: agentLoopDataWithUseFileSystem(false),
    });

    expect(instructions).not.toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).not.toContain(FILES_FIRST_MARKER);
    expect(instructions).toContain("edit_interactive_content_file");
    expect(instructions).toContain("retrieve_interactive_content_file");
  });

  it("treats a conversation with the file system like a new conversation", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: agentLoopDataWithUseFileSystem(true),
    });

    expect(instructions).toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).not.toContain("edit_interactive_content_file");
  });
});
