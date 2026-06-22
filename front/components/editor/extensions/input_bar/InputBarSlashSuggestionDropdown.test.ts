import {
  ADD_CAPABILITY_SLASH_COMMAND_ACTION,
  isRunCommandSlashCommand,
  RUN_COMMAND_SLASH_COMMAND_ACTION,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { describe, expect, it } from "vitest";

import { buildInputBarSlashCommandItems } from "./InputBarSlashSuggestionItems";
import {
  INPUT_BAR_SLASH_COMMANDS,
  type InputBarSlashCommand,
} from "./InputBarSlashSuggestionTypes";

describe("buildInputBarSlashCommandItems", () => {
  it("always includes the add capability command", () => {
    const result = buildInputBarSlashCommandItems({
      commands: [],
      query: "",
    });

    expect(result.map((item) => item.action)).toEqual([
      ADD_CAPABILITY_SLASH_COMMAND_ACTION,
    ]);
  });

  it("lists static commands ahead of add capability", () => {
    const result = buildInputBarSlashCommandItems({
      commands: INPUT_BAR_SLASH_COMMANDS,
      query: "",
    });

    expect(result.map((item) => item.action)).toEqual([
      RUN_COMMAND_SLASH_COMMAND_ACTION,
      ADD_CAPABILITY_SLASH_COMMAND_ACTION,
    ]);
  });

  it("filters commands by the query", async () => {
    const result = buildInputBarSlashCommandItems({
      commands: INPUT_BAR_SLASH_COMMANDS,
      query: "comp",
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
        query: "zzz",
      })
    ).toEqual([]);
  });

  it("filters add capability by the query", () => {
    expect(
      buildInputBarSlashCommandItems({
        commands: [],
        query: "cap",
      }).map((item) => item.label)
    ).toEqual(["Add capability"]);

    expect(
      buildInputBarSlashCommandItems({
        commands: [],
        query: "zzz",
      })
    ).toEqual([]);
  });
});
