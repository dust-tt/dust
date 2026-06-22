import type {
  SlashCommandSkillSuggestion,
  SlashCommandToolSuggestion,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { buildCapabilitySlashCommandItems } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandItems";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { CAPABILITY_SEARCH_NODE_TYPE } from "./CapabilitySearchNode";
import { CapabilitySearchNodeWithView } from "./CapabilitySearchNodeWithView";
import {
  SlashCommandExtension,
  slashCommandPluginKey,
} from "./SlashCommandExtension";

const skillSuggestion = ({
  editedBy = 1,
  icon = null,
  requestedSpaceIds = [],
  userFacingDescription = "",
  ...skill
}: Pick<SlashCommandSkillSuggestion, "name" | "sId"> &
  Partial<SlashCommandSkillSuggestion>): SlashCommandSkillSuggestion => ({
  editedBy,
  icon,
  requestedSpaceIds,
  userFacingDescription,
  ...skill,
});

const toolSuggestion = ({
  description = "Search data.",
  label,
  name = "search",
  serverIcon = "ActionMagnifyingGlassIcon",
  serverName = "search",
  sId,
}: {
  description?: string | null;
  label?: string;
  name?: string | null;
  serverIcon?: MCPServerViewType["server"]["icon"];
  serverName?: string;
  sId: string;
}): SlashCommandToolSuggestion => ({
  id: 1,
  sId,
  name,
  description,
  createdAt: 0,
  updatedAt: 0,
  spaceId: "space_1",
  serverType: "internal",
  server: {
    name: serverName,
    version: "1.0.0",
    description: "Search workspace data.",
    sId: `mcp_server_${serverName}`,
    icon: serverIcon,
    authorization: null,
    tools: [],
    availability: "manual",
    allowMultipleInstances: false,
    documentationUrl: null,
  },
  oAuthUseCase: null,
  editedByUser: null,
  label,
});

describe("buildCapabilitySlashCommandItems", () => {
  it("filters capabilities by name only", async () => {
    const { auth, globalSpace, workspace } =
      await createPrivateApiMockRequest();
    const skill = await SkillFactory.create(auth, {
      name: "Summarize",
      userFacingDescription: "Search spreadsheets and documents.",
    });
    const calendarServer = await RemoteMCPServerFactory.create(workspace, {
      name: "Calendar",
      description: "Search spreadsheets and documents.",
    });
    const calendarServerView = await MCPServerViewFactory.create(
      workspace,
      calendarServer.sId,
      globalSpace
    );

    const result = buildCapabilitySlashCommandItems({
      query: "spreadsheet",
      skills: [skill.toJSON(auth)],
      tools: [calendarServerView.toJSON()],
    });

    expect(result).toEqual([]);
  });

  it("orders non-substring matches by fuzzy relevance", async () => {
    const { auth } = await createPrivateApiMockRequest();
    const generateDailyReportSkill = await SkillFactory.create(auth, {
      name: "Generate Daily Report",
      userFacingDescription: "",
    });
    const googleDriveSkill = await SkillFactory.create(auth, {
      name: "Google Drive",
      userFacingDescription: "",
    });

    const result = buildCapabilitySlashCommandItems({
      query: "gd",
      skills: [
        generateDailyReportSkill.toJSON(auth),
        googleDriveSkill.toJSON(auth),
      ],
      tools: [],
    });

    expect(result.map((item) => item.label)).toEqual([
      "Google Drive",
      "Generate Daily Report",
    ]);
  });

  it("adds filtered skills and excludes the current skill", () => {
    const result = buildCapabilitySlashCommandItems({
      excludeSkillId: "skill_current",
      query: "memo",
      skills: [
        skillSuggestion({
          name: "Create memo",
          sId: "skill_create_memo",
          userFacingDescription: "Draft structured memos.",
        }),
        skillSuggestion({
          name: "Issue triage",
          sId: "skill_issue_triage",
        }),
        skillSuggestion({
          name: "Current skill",
          sId: "skill_current",
        }),
      ],
      tools: [],
    });

    expect(result.map((item) => item.id)).toEqual(["skill_create_memo"]);
    expect(result[0]).toMatchObject({
      action: "select-skill",
      data: {
        skill: {
          icon: null,
          name: "Create memo",
          requestedSpaceIds: [],
          sId: "skill_create_memo",
        },
      },
      description: "Draft structured memos.",
    });
  });

  it("sorts filtered skills and tools together", () => {
    const tool = toolSuggestion({
      label: "Alpha search",
      name: null,
      sId: "mcp_server_view_search",
    });

    const result = buildCapabilitySlashCommandItems({
      query: "",
      skills: [
        skillSuggestion({
          name: "Search checklist",
          sId: "skill_search_checklist",
        }),
      ],
      tools: [tool],
    });

    expect(result.map((item) => item.id)).toEqual([
      "mcp_server_view_search",
      "skill_search_checklist",
    ]);
    expect(result[0]).toMatchObject({
      action: "select-tool",
      data: {
        tool: {
          id: "mcp_server_view_search",
          name: "Alpha search",
          view: tool,
        },
      },
    });
  });
});

describe("SlashCommandExtension", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  function createEditor() {
    editor = new Editor({
      extensions: [
        StarterKit,
        CapabilitySearchNodeWithView,
        SlashCommandExtension.configure({
          onSelectRef: { current: undefined },
        }),
      ],
    });

    return editor;
  }

  it("opens capabilities search after marked text", () => {
    const editor = createEditor();
    editor.commands.setContent("<p><em>Italic text</em></p>");
    editor.commands.focus("end");

    editor.commands.openCapabilitiesSlashCommand();

    expect(editor.getText()).toBe("Italic text");
    expect(
      editor.state.doc.content.firstChild?.content.content.some(
        (node) => node.type.name === CAPABILITY_SEARCH_NODE_TYPE
      )
    ).toBe(true);
  });

  it("opens capabilities search after regular text", () => {
    const editor = createEditor();
    editor.commands.setContent("<p>regular text</p>");
    editor.commands.focus("end");

    editor.commands.openCapabilitiesSlashCommand();

    expect(editor.getText()).toBe("regular text");
    expect(
      editor.state.doc.content.firstChild?.content.content.some(
        (node) => node.type.name === CAPABILITY_SEARCH_NODE_TYPE
      )
    ).toBe(true);
  });

  it("keeps typed slash closed after regular text", () => {
    const editor = createEditor();
    editor.commands.setContent("<p>regular text</p>");
    editor.commands.focus("end");

    editor.commands.insertContent("/");

    expect(slashCommandPluginKey.getState(editor.state)?.active).toBe(false);
  });
});
