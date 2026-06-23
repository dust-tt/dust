import {
  INSERT_CONTEXT_FILE_SLASH_COMMAND_ACTION,
  INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION,
  isRunCommandSlashCommand,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { describe, expect, it } from "vitest";

import { buildInputBarSlashCommandItems } from "./InputBarSlashSuggestionItems";
import {
  getAvailableInputBarSlashCommands,
  INPUT_BAR_SLASH_COMMANDS,
  type InputBarSlashCommand,
} from "./InputBarSlashSuggestionTypes";

const ALL_COMMANDS = getAvailableInputBarSlashCommands({
  hasAttachment: true,
  hasConversation: true,
});

function getInputBarSlashCommandItemId(item: SlashCommand): string {
  if (isRunCommandSlashCommand<InputBarSlashCommand>(item)) {
    return item.data.command.id;
  }

  return item.id;
}

describe("getAvailableInputBarSlashCommands", () => {
  it("includes upload file when attachments are enabled", () => {
    expect(
      getAvailableInputBarSlashCommands({
        hasAttachment: true,
        hasConversation: false,
      }).map((command) => command.id)
    ).toEqual(["upload-file"]);
  });

  it("includes compact only when a conversation exists", () => {
    expect(
      getAvailableInputBarSlashCommands({
        hasAttachment: true,
        hasConversation: true,
      }).map((command) => command.id)
    ).toEqual(["upload-file", "compact"]);
  });
});

describe("buildInputBarSlashCommandItems", () => {
  it("returns no commands when none are available", () => {
    const result = buildInputBarSlashCommandItems({
      commands: [],
      includeAttachKnowledge: false,
      includeSelectContextFile: false,
      query: "",
    });

    expect(result).toEqual([]);
  });

  it("lists commands in INPUT_BAR_SLASH_COMMAND_ORDER", () => {
    const result = buildInputBarSlashCommandItems({
      commands: ALL_COMMANDS,
      includeAttachKnowledge: true,
      includeSelectContextFile: true,
      query: "",
    });

    expect(result.map(getInputBarSlashCommandItemId)).toEqual([
      "compact",
      "reference-file",
      "upload-file",
      "attach-knowledge",
    ]);
  });

  it("excludes reference file when includeSelectContextFile is false", () => {
    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: true,
        includeSelectContextFile: false,
        query: "",
      }).map(getInputBarSlashCommandItemId)
    ).toEqual(["compact", "upload-file", "attach-knowledge"]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: true,
        includeSelectContextFile: false,
        query: "reference",
      })
    ).toEqual([]);
  });

  it("excludes attach knowledge when includeAttachKnowledge is false", () => {
    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: false,
        includeSelectContextFile: true,
        query: "",
      }).map(getInputBarSlashCommandItemId)
    ).toEqual(["compact", "reference-file", "upload-file"]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: false,
        includeSelectContextFile: true,
        query: "knowledge",
      })
    ).toEqual([]);
  });

  it("filters commands by the query", () => {
    const result = buildInputBarSlashCommandItems({
      commands: ALL_COMMANDS,
      includeAttachKnowledge: true,
      includeSelectContextFile: true,
      query: "compact",
    });

    expect(result.map(getInputBarSlashCommandItemId)).toEqual(["compact"]);

    expect(
      buildInputBarSlashCommandItems({
        commands: INPUT_BAR_SLASH_COMMANDS,
        includeAttachKnowledge: true,
        includeSelectContextFile: true,
        query: "upload",
      }).map(getInputBarSlashCommandItemId)
    ).toEqual(["upload-file"]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: true,
        includeSelectContextFile: true,
        query: "knowledge",
      }).map((item) => item.action)
    ).toEqual([INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: true,
        includeSelectContextFile: true,
        query: "reference",
      }).map((item) => item.action)
    ).toEqual([INSERT_CONTEXT_FILE_SLASH_COMMAND_ACTION]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: true,
        includeSelectContextFile: true,
        query: "zzz",
      })
    ).toEqual([]);
  });
});
