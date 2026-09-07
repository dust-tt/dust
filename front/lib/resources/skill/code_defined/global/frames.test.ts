import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_EDIT_ACTION_NAME,
  FILES_LIST_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import {
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
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
const POD_APP_UPDATE_MARKER = "#### Changing An Existing Pod Frame";
const POD_STORAGE_MARKER = "### Where The Frame's Data Lives";

const FILES_EDIT_TOOL = getPrefixedToolName(
  FILES_SERVER_NAME,
  FILES_EDIT_ACTION_NAME
);
const FILES_LIST_TOOL = getPrefixedToolName(
  FILES_SERVER_NAME,
  FILES_LIST_ACTION_NAME
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
  it("uses the dsbx lifecycle and keeps the remaining MCP tools under Frames v2", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "frames_v2");

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).toContain("dsbx frame publish");
    expect(instructions).toContain("dsbx frame create");
    expect(instructions).toContain("dsbx frame register");
    expect(instructions).toContain("dsbx frame share-link");
    expect(instructions).toContain("dsbx frame call");
    expect(instructions).toContain("stable Frame ID");
    expect(instructions).toContain("additionally requires read access");
    expect(instructions).toContain("does not test the Frame");
    expect(instructions).toContain("dsbx frame validate");
    expect(instructions).toContain(
      "Frame sharing and use rights are configured by the user in the Dust UI"
    );
    expect(instructions).toContain("This command is read-only");
    expect(instructions).not.toContain("--scope");
    expect(instructions).not.toContain("--email");
    expect(instructions).toContain("package-like folder");
    expect(instructions).toContain("canonical Frame resource");
    expect(instructions).toContain("`index.tsx` by default");
    expect(instructions).toContain("single `.tsx` entry file");
    expect(instructions).toContain("atomically activates the publication");
    expect(instructions).toContain("## Authoring a function");
    expect(instructions).toContain('userIdentity: "workspace_user_required"');
    expect(instructions).toContain("### Fast and durable functions");
    expect(instructions).toContain("dsbx tools --json");
    expect(instructions).toContain("usePodFunctionMutation");
    expect(instructions).toContain("## Persisting state in a Frame database");
    expect(instructions).toContain('db("comments")');
    expect(instructions).toContain("reconciles the declared schemas");
    expect(instructions).toContain("### React Component Rules");
    expect(instructions).toContain("legacy Frame");
    expect(instructions).toContain("<frame>.tsx");
    expect(instructions).toContain(
      "Chat apps, task lists, trackers, forms, CRUD apps"
    );
    expect(instructions).toContain(
      "Do not store durable application state in memory; use a Frame database"
    );
    expect(instructions).toContain(
      "Use the Computer to create and edit their source"
    );
    expect(instructions).toContain("Do not pass the convenience aliases");
    expect(instructions).toContain("`/files/conversation` or `/files/pod`");
    expect(instructions).toContain(
      "Never run concurrent file mutations against the same path"
    );
    expect(instructions).toContain(
      "Do not replace an entire UI or function for a localized"
    );
    expect(instructions).toContain(
      "mark required fields in a newly created table as `.notNull()`"
    );
    expect(instructions).toContain("shared Zod domain");
    expect(instructions).toContain("instead of `bun build`");
    expect(instructions).toContain(
      "Other interactive-content tools remain available"
    );
    expect(framesSkill.mcpServers).toEqual([
      { name: "interactive_content" },
      { name: "conversation_side_panel" },
    ]);
    await expect(
      InternalMCPServerInMemoryResource.isRestrictedForWorkspace(
        auth,
        "interactive_content"
      )
    ).resolves.toBe(false);
  });

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
  });

  it("teaches how to find an existing Pod app's path and file id", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: agentLoopDataInPod("vlt_abc123"),
    });

    expect(instructions).toContain(POD_APP_UPDATE_MARKER);
    expect(instructions).toContain(FILES_LIST_TOOL);
    expect(instructions).toContain("[id: fil_...]");
  });

  it("omits the storage decision when pod functions are unavailable", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: agentLoopDataInPod("vlt_abc123"),
    });

    expect(instructions).toContain(POD_APP_MARKER);
    expect(instructions).not.toContain(POD_STORAGE_MARKER);
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
