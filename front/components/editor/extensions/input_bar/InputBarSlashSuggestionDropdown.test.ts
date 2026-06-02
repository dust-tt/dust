import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { describe, expect, it } from "vitest";

import { filterInputBarSlashSuggestions } from "./InputBarSlashSuggestionDropdown";

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

  it("only includes unpublished skills when the user can edit them", async () => {
    const { auth } = await createPrivateApiMockRequest();
    const unpublishedSkill = await SkillFactory.create(auth, {
      name: "Draft Skill",
      visibility: "unpublished",
    });
    const serializedSkill = unpublishedSkill.toJSON(auth);

    const resultForNonEditor = filterInputBarSlashSuggestions({
      query: "",
      selectedMCPServerViewIds: new Set(),
      serverViews: [],
      skills: [{ ...serializedSkill, canWrite: false }],
    });

    expect(resultForNonEditor).toEqual([]);

    const resultForEditor = filterInputBarSlashSuggestions({
      query: "",
      selectedMCPServerViewIds: new Set(),
      serverViews: [],
      skills: [{ ...serializedSkill, canWrite: true }],
    });

    expect(
      resultForEditor.map((capability) =>
        capability.kind === "skill" ? capability.skill.name : ""
      )
    ).toEqual(["Draft Skill"]);
  });
});
