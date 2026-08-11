import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_EDIT_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import {
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { framesSkill } from "@app/lib/resources/skill/code_defined/global/frames";
import { POD_FUNCTIONS_SKILL_NAME } from "@app/lib/resources/skill/code_defined/global/pod_functions";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { describe, expect, it } from "vitest";

// Markers unique to each variant of the updating section.
const COMPUTER_FIRST_MARKER =
  "mounted in the Computer at `/files/conversation-";
const FILES_FIRST_MARKER =
  "available to your file tools at `conversation-<conversationId>";

// Markers unique to each Pod-only section.
const POD_APP_MARKER = "### Frames In A Pod";
const POD_STORAGE_MARKER = "### Where The Frame's Data Lives";
const POD_VERIFICATION_MARKER = "### Verifying A Frame";

// Marker unique to the non-Pod persistence warning.
const NON_POD_STATE_MARKER = "### Frame State Outside A Pod";

const FILES_EDIT_TOOL = getPrefixedToolName(
  FILES_SERVER_NAME,
  FILES_EDIT_ACTION_NAME
);

function agentLoopDataWithUseFileSystem(
  useFileSystem: boolean | undefined
): AgentLoopExecutionData {
  return {
    conversation: { metadata: { useFileSystem } },
  } as unknown as AgentLoopExecutionData;
}

function agentLoopDataInPod(spaceId: string | null): AgentLoopExecutionData {
  return {
    conversation: { metadata: { useFileSystem: true }, spaceId },
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

  it("teaches the files-tools flow when the Computer is disabled", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "disable_computer_feature");

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).not.toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).toContain(FILES_FIRST_MARKER);
    expect(instructions).toContain(FILES_EDIT_TOOL);
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
    expect(instructions).not.toContain(FILES_FIRST_MARKER);
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

  it("keeps Frames in the conversation outside a Pod", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "sandbox_functions");

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: agentLoopDataInPod(null),
    });

    expect(instructions).not.toContain(POD_APP_MARKER);
    expect(instructions).not.toContain(POD_STORAGE_MARKER);
    expect(instructions).not.toContain(POD_VERIFICATION_MARKER);
    expect(instructions).toContain(NON_POD_STATE_MARKER);
    expect(instructions).toContain("suggest building the Frame in a Pod");
  });

  it("omits the Pod suggestion outside a Pod when pod functions are unavailable", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: agentLoopDataInPod(null),
    });

    expect(instructions).toContain(NON_POD_STATE_MARKER);
    expect(instructions).not.toContain("suggest building the Frame in a Pod");
  });

  it("teaches the Pod app layout and storage decision in a Pod", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "sandbox_functions");

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: agentLoopDataInPod("vlt_abc123"),
    });

    expect(instructions).toContain(POD_APP_MARKER);
    expect(instructions).toContain("pod-<podId>/MyApp/MyApp.tsx");
    expect(instructions).toContain(POD_STORAGE_MARKER);
    expect(instructions).toContain(`\`${POD_FUNCTIONS_SKILL_NAME}\` skill`);
    expect(instructions).toContain(POD_VERIFICATION_MARKER);
    expect(instructions).toContain("always fetch the Frame's share URL");
    expect(instructions).not.toContain(NON_POD_STATE_MARKER);
  });

  it("omits the storage decision when pod functions are unavailable", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: agentLoopDataInPod("vlt_abc123"),
    });

    expect(instructions).toContain(POD_APP_MARKER);
    expect(instructions).not.toContain(POD_STORAGE_MARKER);
    expect(instructions).not.toContain(POD_VERIFICATION_MARKER);
  });

  it("keeps the legacy flow for a Pod conversation without the file system", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "sandbox_functions");

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: {
        conversation: { metadata: { useFileSystem: false }, spaceId: "vlt_a" },
      } as unknown as AgentLoopExecutionData,
    });

    expect(instructions).not.toContain(POD_APP_MARKER);
    expect(instructions).toContain(RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
  });
});
