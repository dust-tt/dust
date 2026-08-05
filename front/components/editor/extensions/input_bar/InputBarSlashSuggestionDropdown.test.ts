import {
  INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION,
  isRunCommandSlashCommand,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { PICK_MODEL_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
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
      includePickModel: false,
      query: "",
    });

    expect(result).toEqual([]);
  });

  it("lists commands in INPUT_BAR_SLASH_COMMAND_ORDER", () => {
    const result = buildInputBarSlashCommandItems({
      commands: ALL_COMMANDS,
      includeAttachKnowledge: true,
      includePickModel: true,
      query: "",
    });

    expect(result.map(getInputBarSlashCommandItemId)).toEqual([
      "compact",
      "upload-file",
      "attach-knowledge",
      "pick-model",
    ]);
  });

  it("excludes attach knowledge when includeAttachKnowledge is false", () => {
    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: false,
        includePickModel: false,
        query: "",
      }).map(getInputBarSlashCommandItemId)
    ).toEqual(["compact", "upload-file"]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: false,
        includePickModel: false,
        query: "knowledge",
      })
    ).toEqual([]);
  });

  it("excludes pick model when includePickModel is false", () => {
    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: false,
        includePickModel: false,
        query: "model",
      })
    ).toEqual([]);
  });

  it("filters commands by the query", () => {
    const result = buildInputBarSlashCommandItems({
      commands: ALL_COMMANDS,
      includeAttachKnowledge: true,
      includePickModel: true,
      query: "compact",
    });

    expect(result.map(getInputBarSlashCommandItemId)).toEqual(["compact"]);

    expect(
      buildInputBarSlashCommandItems({
        commands: INPUT_BAR_SLASH_COMMANDS,
        includeAttachKnowledge: true,
        includePickModel: false,
        query: "upload",
      }).map(getInputBarSlashCommandItemId)
    ).toEqual(["upload-file"]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: true,
        includePickModel: false,
        query: "knowledge",
      }).map((item) => item.action)
    ).toEqual([INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: true,
        includePickModel: false,
        query: "reference",
      }).map((item) => item.action)
    ).toEqual([INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: true,
        includePickModel: false,
        query: "company",
      }).map((item) => item.action)
    ).toEqual([INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: false,
        includePickModel: true,
        query: "model",
      }).map((item) => item.action)
    ).toEqual([PICK_MODEL_SLASH_COMMAND_ACTION]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: true,
        includePickModel: true,
        query: "zzz",
      })
    ).toEqual([]);
  });
});
