import { buildAdminProgram } from "@connectors/admin/cli_program";
import { buildCliCommandCatalog } from "@connectors/lib/admin/catalog";
import { describe, expect, it } from "vitest";

describe("buildCliCommandCatalog", () => {
  const catalog = buildCliCommandCatalog(buildAdminProgram());

  it("includes every command group with a description", () => {
    const names = catalog.groups.map((g) => g.majorCommand);
    // Spot-check a few groups across typed and record-arg schemas.
    expect(names).toContain("slack");
    expect(names).toContain("gong");
    expect(names).toContain("connectors");
    for (const group of catalog.groups) {
      expect(group.description.length).toBeGreaterThan(0);
    }
  });

  it("lists subcommands from the zod schema", () => {
    const slack = catalog.groups.find((g) => g.majorCommand === "slack");
    expect(slack?.subcommands).toContain("check-channel");
    expect(slack?.subcommands).toContain("skip-channel");
  });

  it("lists param options with descriptions and number hints", () => {
    const gong = catalog.groups.find((g) => g.majorCommand === "gong");
    const connectorId = gong?.options.find((o) => o.name === "connectorId");
    // gong declares --connectorId with parseInt.
    expect(connectorId?.isNumber).toBe(true);
    expect(connectorId?.description.length).toBeGreaterThan(0);

    const callId = gong?.options.find((o) => o.name === "callId");
    expect(callId?.isNumber).toBe(false);
  });
});
