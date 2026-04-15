import { filterInputBarSkills } from "@app/components/editor/extensions/input_bar/InputBarSkillSuggestionDropdown";
import {
  filterInputBarSlashCommands,
  getInputBarSkillSlashTrigger,
  shouldAllowInputBarSkillSlash,
} from "@app/components/editor/extensions/input_bar/InputBarSkillSuggestionExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SKILLS: SkillType[] = [
  {
    id: 1,
    sId: "skill_alpha",
    name: "Alpha Search",
    icon: null,
    userFacingDescription: "Alpha skill",
    createdAt: 0,
    updatedAt: 0,
    status: "active",
    agentFacingDescription: "Alpha agent description",
    instructions: null,
    instructionsHtml: null,
    source: null,
    sourceMetadata: null,
    requestedSpaceIds: [],
    tools: [],
    fileAttachments: [],
    canWrite: false,
    isExtendable: true,
    extendedSkillId: null,
    editedBy: null,
    isDefault: false,
  },
  {
    id: 2,
    sId: "skill_beta",
    name: "Beta Review",
    icon: null,
    userFacingDescription: "Beta skill",
    createdAt: 0,
    updatedAt: 0,
    status: "active",
    agentFacingDescription: "Beta agent description",
    instructions: null,
    instructionsHtml: null,
    source: null,
    sourceMetadata: null,
    requestedSpaceIds: [],
    tools: [],
    fileAttachments: [],
    canWrite: false,
    isExtendable: true,
    extendedSkillId: null,
    editedBy: null,
    isDefault: false,
  },
  {
    id: 3,
    sId: "skill_gamma",
    name: "Gamma Tools",
    icon: null,
    userFacingDescription: "Gamma skill",
    createdAt: 0,
    updatedAt: 0,
    status: "active",
    agentFacingDescription: "Gamma agent description",
    instructions: null,
    instructionsHtml: null,
    source: null,
    sourceMetadata: null,
    requestedSpaceIds: [],
    tools: [],
    fileAttachments: [],
    canWrite: false,
    isExtendable: true,
    extendedSkillId: null,
    editedBy: null,
    isDefault: false,
  },
];

describe("filterInputBarSlashCommands", () => {
  it("returns the Skills slash command by default", () => {
    const results = filterInputBarSlashCommands("");

    expect(results.map((command) => command.label)).toEqual(["Skills"]);
  });

  it("keeps the Skills slash command visible while the user types a skill query", () => {
    expect(filterInputBarSlashCommands("skill")).toHaveLength(1);
    expect(filterInputBarSlashCommands("conversation")).toHaveLength(1);
    expect(filterInputBarSlashCommands("unknown")).toHaveLength(1);
    expect(filterInputBarSlashCommands("github")).toHaveLength(1);
  });
});

describe("filterInputBarSkills", () => {
  it("filters selected skills and matches by name case-insensitively", () => {
    const results = filterInputBarSkills({
      query: "beta",
      selectedSkillIds: new Set(["skill_alpha"]),
      skills: SKILLS,
    });

    expect(results.map((skill) => skill.sId)).toEqual(["skill_beta"]);
  });

  it("returns alphabetically sorted skills when the query is empty", () => {
    const results = filterInputBarSkills({
      query: "",
      selectedSkillIds: new Set(),
      skills: [SKILLS[2], SKILLS[0], SKILLS[1]],
    });

    expect(results.map((skill) => skill.sId)).toEqual([
      "skill_alpha",
      "skill_beta",
      "skill_gamma",
    ]);
  });
});

describe("shouldAllowInputBarSkillSlash", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("allows the slash at the start of the document after focus", () => {
    editor.commands.setContent("/", { contentType: "markdown" });

    expect(
      shouldAllowInputBarSkillSlash({
        hasBeenFocused: true,
        range: { from: 1, to: 1 },
        state: editor.state,
      })
    ).toBe(true);
  });

  it("allows the slash after whitespace and rejects it in the middle of a token", () => {
    editor.commands.setContent("hello /world", { contentType: "markdown" });

    expect(
      shouldAllowInputBarSkillSlash({
        hasBeenFocused: true,
        range: { from: 7, to: 12 },
        state: editor.state,
      })
    ).toBe(true);

    editor.commands.setContent("https://dust.tt", { contentType: "markdown" });

    expect(
      shouldAllowInputBarSkillSlash({
        hasBeenFocused: true,
        range: { from: 7, to: 7 },
        state: editor.state,
      })
    ).toBe(false);
  });

  it("rejects the slash before the editor has been focused", () => {
    editor.commands.setContent("/", { contentType: "markdown" });

    expect(
      shouldAllowInputBarSkillSlash({
        hasBeenFocused: false,
        range: { from: 1, to: 1 },
        state: editor.state,
      })
    ).toBe(false);
  });
});

describe("getInputBarSkillSlashTrigger", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("extracts the current slash query and range at the cursor", () => {
    editor.commands.setContent("/github", { contentType: "markdown" });

    const trigger = getInputBarSkillSlashTrigger(editor.state);

    expect(trigger).toEqual({
      query: "github",
      range: { from: 1, to: 8 },
    });
  });

  it("returns null when the cursor is not in a slash trigger", () => {
    editor.commands.setContent("hello world", { contentType: "markdown" });

    expect(getInputBarSkillSlashTrigger(editor.state)).toBeNull();
  });
});
