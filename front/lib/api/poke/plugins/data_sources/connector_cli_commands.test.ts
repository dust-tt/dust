import {
  buildConnectorCommandOptions,
  parseConnectorCommandValue,
  relevantGroupsForProvider,
} from "@app/lib/api/poke/plugins/data_sources/connector_cli_commands";
import type { CliCommandCatalog } from "@app/types/connectors/admin/catalog";
import { describe, expect, it } from "vitest";

const catalog: CliCommandCatalog = {
  groups: [
    {
      majorCommand: "connectors",
      description: "Generic connector lifecycle operations",
      subcommands: ["pause", "resume"],
      options: [
        { name: "wId", description: "", isNumber: false, isBoolean: false },
      ],
    },
    {
      majorCommand: "slack",
      description: "Slack connector management",
      subcommands: ["sync-channel", "check-channel"],
      options: [
        {
          name: "channelId",
          description: "",
          isNumber: false,
          isBoolean: false,
        },
      ],
    },
    {
      majorCommand: "gong",
      description: "Gong connector management",
      subcommands: ["force-resync"],
      options: [
        {
          name: "connectorId",
          description: "",
          isNumber: true,
          isBoolean: false,
        },
      ],
    },
  ],
};

describe("relevantGroupsForProvider", () => {
  it("returns the provider group and the generic group", () => {
    const names = relevantGroupsForProvider(catalog, "slack").map(
      (g) => g.majorCommand
    );
    expect(names).toEqual(["connectors", "slack"]);
  });

  it("returns only the generic group when the provider has no CLI group", () => {
    const names = relevantGroupsForProvider(catalog, "bigquery").map(
      (g) => g.majorCommand
    );
    expect(names).toEqual(["connectors"]);
  });
});

describe("buildConnectorCommandOptions", () => {
  it("suffixes labels with the group when more than one group is relevant", () => {
    const options = buildConnectorCommandOptions(catalog, "slack");
    expect(options).toContainEqual({
      label: "sync-channel (slack)",
      value: "slack::sync-channel",
    });
    expect(options).toContainEqual({
      label: "pause (connectors)",
      value: "connectors::pause",
    });
  });

  it("omits the group suffix when only the generic group is relevant", () => {
    const options = buildConnectorCommandOptions(catalog, "bigquery");
    expect(options).toEqual([
      { label: "pause", value: "connectors::pause" },
      { label: "resume", value: "connectors::resume" },
    ]);
  });
});

describe("parseConnectorCommandValue", () => {
  it("splits a group::command value, preserving hyphens in the command", () => {
    expect(parseConnectorCommandValue("gong::force-resync")).toEqual({
      majorCommand: "gong",
      command: "force-resync",
    });
  });

  it("returns null for a value without the separator", () => {
    expect(parseConnectorCommandValue("nope")).toBeNull();
  });
});
