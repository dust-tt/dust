import { buildAdminRunArgs } from "@app/lib/api/poke/plugins/data_sources/args_json";
import type { CliCommandOption } from "@app/types/connectors/admin/catalog";
import { describe, expect, it } from "vitest";

const options: CliCommandOption[] = [
  { name: "connectorId", description: "", isNumber: true, isBoolean: false },
  { name: "channelId", description: "", isNumber: false, isBoolean: false },
  { name: "force", description: "", isNumber: false, isBoolean: true },
];

describe("buildAdminRunArgs", () => {
  it("coerces number params and keeps strings", () => {
    const args = buildAdminRunArgs(
      { connectorId: "42", channelId: "C123", force: "true" },
      options
    );
    expect(args).toEqual({ connectorId: 42, channelId: "C123", force: "true" });
  });

  it("drops empty values", () => {
    const args = buildAdminRunArgs(
      { connectorId: "", channelId: "C123" },
      options
    );
    expect(args).toEqual({ channelId: "C123" });
  });

  it("ignores values with no matching option", () => {
    const args = buildAdminRunArgs({ unknown: "x", channelId: "y" }, options);
    expect(args).toEqual({ channelId: "y" });
  });
});
