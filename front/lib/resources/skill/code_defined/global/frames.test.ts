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
  it("uses the dsbx lifecycle and keeps MCP export under Frames v2", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "frames_v2");

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    for (const expected of [
      'mkdir -p "$FRAME"',
      'bash "/files/conversation-<conversationId>/skills/Create Frames/lint.sh" "$FRAME"',
      'dsbx frame publish "$FRAME/manifest.json"',
      "dsbx frame publish /files/<scope>/<frame>.tsx",
      "--replaces /files/<scope>/dashboards/Sales.tsx",
      "`gmail1` and `gmail2`",
      "dsbx frame call <frame-id>",
      "dsbx frame share-link",
      "conversation_side_panel.open_frame",
      "`export_interactive_content_file` is the only interactive-content tool",
      "never the `/files/conversation` or `/files/pod` aliases",
      "server's `move` tool",
      "Never `mv` or `cp`",
      'userIdentity: "workspace_user_required"',
      "frame_author_required",
      'import { tools } from "@dust/pod"',
      "never shell out to `dsbx`",
      'db("comments")',
      "`.notNull()`",
      "persistentFilesDir()",
      "useFrameFunctionMutation",
      "as CommentList | undefined",
      "triggerUserFileDownload",
      "<FrameRoot theme={theme}",
      "@dust/slideshow/v2",
    ]) {
      expect(instructions).toContain(expected);
    }
    for (const unexpected of [
      "dsbx frame create",
      "dsbx frame register",
      "dsbx frame validate",
      "--scope",
      "--email",
      "Do not offer a download button",
      "@dust/document/v1",
    ]) {
      expect(instructions).not.toContain(unexpected);
    }
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

  it("adds Document guidance only with frame_documents", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "frames_v2");
    await FeatureFlagFactory.basic(auth, "frame_documents");

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).toContain("### Documents");
    expect(instructions).toContain("`@dust/document/v1`");
    expect(instructions).toContain("document.md");
  });

  it("teaches the computer-first flow when the Computer is enabled", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).toContain(COMPUTER_FIRST_MARKER);
    expect(instructions).toContain("### Slideshows");
    expect(instructions).toContain("Keep the built-in width and height");
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

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: agentLoopDataInPod(null),
    });

    expect(instructions).not.toContain(POD_APP_MARKER);
    expect(instructions).not.toContain(POD_STORAGE_MARKER);
  });

  it("teaches the Pod app layout in a Pod", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await framesSkill.fetchInstructions(auth, {
      spaceIds: [],
      agentLoopData: agentLoopDataInPod("vlt_abc123"),
    });

    expect(instructions).toContain(POD_APP_MARKER);
    expect(instructions).toContain("pod-<podId>/MyApp/MyApp.tsx");
    expect(instructions).not.toContain(POD_STORAGE_MARKER);
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

  it("keeps the legacy flow for a Pod conversation without the file system", async () => {
    const { authenticator: auth } = await createResourceTest({});

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
