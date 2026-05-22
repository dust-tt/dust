import { describe, expect, it } from "vitest";

import {
  detectAvailabilityChanges,
  ENSURE_AUTO_MCP_SERVER_VIEWS_SCRIPT,
  MIGRATE_LEGACY_MANUAL_TO_AUTO_SCRIPT,
  validateInternalToolAvailabilitySnapshots,
} from "./internal_mcp_server_availability_snapshots";

describe("detectAvailabilityChanges", () => {
  it("detects tools moved from manual to auto", () => {
    const previous = {
      auto: [{ name: "search", id: 1006 }],
      manual: [{ name: "wakeups", id: 1031 }],
    };
    const current = {
      auto: [
        { name: "search", id: 1006 },
        { name: "wakeups", id: 1031 },
      ],
      manual: [],
    };

    expect(detectAvailabilityChanges(previous, current)).toEqual({
      movedToAuto: [{ name: "wakeups", id: 1031 }],
      movedToManual: [],
      newAutoTools: [],
      newManualTools: [],
    });
  });

  it("detects tools moved from auto to manual", () => {
    const previous = {
      auto: [{ name: "wakeups", id: 1031 }],
      manual: [{ name: "github", id: 1 }],
    };
    const current = {
      auto: [],
      manual: [
        { name: "github", id: 1 },
        { name: "wakeups", id: 1031 },
      ],
    };

    expect(detectAvailabilityChanges(previous, current)).toEqual({
      movedToAuto: [],
      movedToManual: [{ name: "wakeups", id: 1031 }],
      newAutoTools: [],
      newManualTools: [],
    });
  });

  it("detects newly added auto tools", () => {
    const previous = {
      auto: [{ name: "search", id: 1006 }],
      manual: [{ name: "github", id: 1 }],
    };
    const current = {
      auto: [
        { name: "search", id: 1006 },
        { name: "wakeups", id: 1031 },
      ],
      manual: [{ name: "github", id: 1 }],
    };

    expect(detectAvailabilityChanges(previous, current)).toEqual({
      movedToAuto: [],
      movedToManual: [],
      newAutoTools: [{ name: "wakeups", id: 1031 }],
      newManualTools: [],
    });
  });

  it("detects newly added manual tools", () => {
    const previous = {
      auto: [{ name: "search", id: 1006 }],
      manual: [{ name: "github", id: 1 }],
    };
    const current = {
      auto: [{ name: "search", id: 1006 }],
      manual: [
        { name: "github", id: 1 },
        { name: "linear", id: 53 },
      ],
    };

    expect(detectAvailabilityChanges(previous, current)).toEqual({
      movedToAuto: [],
      movedToManual: [],
      newAutoTools: [],
      newManualTools: [{ name: "linear", id: 53 }],
    });
  });
});

describe("validateInternalToolAvailabilitySnapshots", () => {
  it("mentions the legacy sId migration script when a tool moves from manual to auto", () => {
    const result = validateInternalToolAvailabilitySnapshots({
      previousAuto: [{ name: "search", id: 1006 }],
      previousManual: [{ name: "wakeups", id: 1031 }],
      currentAuto: [
        { name: "search", id: 1006 },
        { name: "wakeups", id: 1031 },
      ],
      currentManual: [],
    });

    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining(MIGRATE_LEGACY_MANUAL_TO_AUTO_SCRIPT),
    });
    if (!result.ok) {
      expect(result.message).toContain("--scanOnly");
      expect(result.message).toContain("--execute");
      expect(result.message).not.toContain(ENSURE_AUTO_MCP_SERVER_VIEWS_SCRIPT);
    }
  });

  it("mentions agent migration when a tool moves from auto to manual", () => {
    const result = validateInternalToolAvailabilitySnapshots({
      previousAuto: [{ name: "wakeups", id: 1031 }],
      previousManual: [{ name: "github", id: 1 }],
      currentAuto: [],
      currentManual: [
        { name: "github", id: 1 },
        { name: "wakeups", id: 1031 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain(
        "getAgentConfigurationGroupIdsFromActions"
      );
      expect(result.message).not.toContain(ENSURE_AUTO_MCP_SERVER_VIEWS_SCRIPT);
      expect(result.message).not.toContain(
        MIGRATE_LEGACY_MANUAL_TO_AUTO_SCRIPT
      );
    }
  });

  it("mentions the ensure MCP server views script for newly added auto tools", () => {
    const result = validateInternalToolAvailabilitySnapshots({
      previousAuto: [{ name: "search", id: 1006 }],
      previousManual: [{ name: "github", id: 1 }],
      currentAuto: [
        { name: "search", id: 1006 },
        { name: "wakeups", id: 1031 },
      ],
      currentManual: [{ name: "github", id: 1 }],
    });

    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining(ENSURE_AUTO_MCP_SERVER_VIEWS_SCRIPT),
    });
    if (!result.ok) {
      expect(result.message).not.toContain(
        MIGRATE_LEGACY_MANUAL_TO_AUTO_SCRIPT
      );
    }
  });

  it("mentions snapshot update for newly added manual tools", () => {
    const result = validateInternalToolAvailabilitySnapshots({
      previousAuto: [{ name: "search", id: 1006 }],
      previousManual: [{ name: "github", id: 1 }],
      currentAuto: [{ name: "search", id: 1006 }],
      currentManual: [
        { name: "github", id: 1 },
        { name: "linear", id: 53 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain(
        "test:update-internal-mcp-availability-snapshot"
      );
      expect(result.message).not.toContain(
        MIGRATE_LEGACY_MANUAL_TO_AUTO_SCRIPT
      );
      expect(result.message).not.toContain(ENSURE_AUTO_MCP_SERVER_VIEWS_SCRIPT);
    }
  });

  it("mentions snapshot update when a tool is removed", () => {
    const result = validateInternalToolAvailabilitySnapshots({
      previousAuto: [{ name: "search", id: 1006 }],
      previousManual: [
        { name: "github", id: 1 },
        { name: "linear", id: 53 },
      ],
      currentAuto: [{ name: "search", id: 1006 }],
      currentManual: [{ name: "github", id: 1 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain(
        "test:update-internal-mcp-availability-snapshot"
      );
    }
  });

  it("returns ok when snapshots match", () => {
    const snapshots = {
      previousAuto: [{ name: "search", id: 1006 }],
      previousManual: [{ name: "github", id: 1 }],
      currentAuto: [{ name: "search", id: 1006 }],
      currentManual: [{ name: "github", id: 1 }],
    };

    expect(validateInternalToolAvailabilitySnapshots(snapshots)).toEqual({
      ok: true,
    });
  });
});
