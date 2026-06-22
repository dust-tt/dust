import {
  ADD_CAPABILITY_SLASH_COMMAND_ACTION,
  INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION,
  isRunCommandSlashCommand,
  RUN_COMMAND_SLASH_COMMAND_ACTION,
  type RunCommandSlashCommand,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
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
  it("always includes the add capability command", () => {
    const result = buildInputBarSlashCommandItems({
      commands: [],
      includeAttachKnowledge: false,
      query: "",
    });

    expect(result.map((item) => item.action)).toEqual([
      ADD_CAPABILITY_SLASH_COMMAND_ACTION,
    ]);
  });

  it("lists static commands ahead of attach knowledge and add capability", () => {
    const result = buildInputBarSlashCommandItems({
      commands: ALL_COMMANDS,
      includeAttachKnowledge: true,
      query: "",
    });

    expect(result.map((item) => item.action)).toEqual([
      RUN_COMMAND_SLASH_COMMAND_ACTION,
      RUN_COMMAND_SLASH_COMMAND_ACTION,
      INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION,
      ADD_CAPABILITY_SLASH_COMMAND_ACTION,
    ]);
  });

  it("filters commands by the query", async () => {
    const result = buildInputBarSlashCommandItems({
      commands: ALL_COMMANDS,
      includeAttachKnowledge: true,
      query: "compact",
    });

    expect(
      result.map((item) =>
        item.action === RUN_COMMAND_SLASH_COMMAND_ACTION &&
        isRunCommandSlashCommand<InputBarSlashCommand>(item)
          ? item.data.command.id
          : item.action
      )
    ).toEqual(["compact"]);

    expect(
      buildInputBarSlashCommandItems({
        commands: INPUT_BAR_SLASH_COMMANDS,
        includeAttachKnowledge: true,
        query: "upload",
      }).map((item) =>
        item.action === RUN_COMMAND_SLASH_COMMAND_ACTION
          ? (item as RunCommandSlashCommand<InputBarSlashCommand>).data.command
              .id
          : item.action
      )
    ).toEqual(["upload-file"]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: true,
        query: "attach",
      }).map((item) => item.action)
    ).toEqual([INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION]);

    expect(
      buildInputBarSlashCommandItems({
        commands: ALL_COMMANDS,
        includeAttachKnowledge: true,
        query: "zzz",
      })
    ).toEqual([]);
  });

  it("filters add capability by the query", () => {
    expect(
      buildInputBarSlashCommandItems({
        commands: [],
        includeAttachKnowledge: false,
        query: "cap",
      }).map((item) => item.label)
    ).toEqual(["Add capability"]);

    expect(
      buildInputBarSlashCommandItems({
        commands: [],
        includeAttachKnowledge: false,
        query: "zzz",
      })
    ).toEqual([]);
  });
});
