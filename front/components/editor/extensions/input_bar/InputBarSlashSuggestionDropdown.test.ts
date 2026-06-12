import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { describe, expect, it } from "vitest";

import { filterInputBarSlashSuggestions } from "./InputBarSlashSuggestionDropdown";
import { INPUT_BAR_SLASH_COMMANDS } from "./InputBarSlashSuggestionTypes";

describe("filterInputBarSlashSuggestions", () => {
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

    const result = filterInputBarSlashSuggestions({
      commands: [],
      query: "spreadsheet",
      selectedMCPServerViewIds: new Set(),
      serverViews: [calendarServerView.toJSON()],
      skills: [skill.toJSON(auth)],
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

    const result = filterInputBarSlashSuggestions({
      commands: [],
      query: "gd",
      selectedMCPServerViewIds: new Set(),
      serverViews: [],
      skills: [
        generateDailyReportSkill.toJSON(auth),
        googleDriveSkill.toJSON(auth),
      ],
    });

    expect(
      result.map((capability) =>
        capability.kind === "skill" ? capability.skill.name : ""
      )
    ).toEqual(["Google Drive", "Generate Daily Report"]);
  });

  it("lists commands ahead of capabilities", async () => {
    const { auth } = await createPrivateApiMockRequest();
    const skill = await SkillFactory.create(auth, {
      name: "Aardvark Facts",
      userFacingDescription: "",
    });

    const result = filterInputBarSlashSuggestions({
      commands: INPUT_BAR_SLASH_COMMANDS,
      query: "",
      selectedMCPServerViewIds: new Set(),
      serverViews: [],
      skills: [skill.toJSON(auth)],
    });

    expect(result.map((capability) => capability.kind)).toEqual([
      "command",
      "skill",
    ]);
  });

  it("filters commands by the query", async () => {
    const result = filterInputBarSlashSuggestions({
      commands: INPUT_BAR_SLASH_COMMANDS,
      query: "comp",
      selectedMCPServerViewIds: new Set(),
      serverViews: [],
      skills: [],
    });

    expect(
      result.map((capability) =>
        capability.kind === "command" ? capability.command.id : ""
      )
    ).toEqual(["compact"]);

    expect(
      filterInputBarSlashSuggestions({
        commands: INPUT_BAR_SLASH_COMMANDS,
        query: "zzz",
        selectedMCPServerViewIds: new Set(),
        serverViews: [],
        skills: [],
      })
    ).toEqual([]);
  });
});
