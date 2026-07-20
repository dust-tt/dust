import {
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { framesSkill } from "@app/lib/resources/skill/code_defined/global/frames";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { describe, expect, it } from "vitest";

// Markers unique to each variant of the updating section.
const COMPUTER_FIRST_MARKER =
  "mounted in the Computer at `/files/conversation-";
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
    expect(instructions).toContain(PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(instructions).not.toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(instructions).not.toContain(
      RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME
    );
  });

  it("keeps the retrieve and file-id edit flow for legacy conversations", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: agentLoopDataWithUseFileSystem(false),
    });

    expect(instructions).not.toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(instructions).toContain(RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
  });

  it("treats a conversation with the file system like a new conversation", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: agentLoopDataWithUseFileSystem(true),
    });

    expect(instructions).toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).not.toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
  });
});
