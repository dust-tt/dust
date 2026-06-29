/**
 * Internal MCP server availability snapshot test
 *
 * Compares INTERNAL_MCP_SERVERS against internal_mcp_server_availability.snapshot.json.
 *
 * Usage:
 * - Run tests: npm run test -- lib/actions/mcp_internal_actions/constants.test.ts
 * - Update snapshot: npm run test:update-internal-mcp-availability-snapshot
 */

import { describe, expect, it } from "vitest";

import {
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  INTERNAL_MCP_SERVERS,
  isHotMCPServerName,
  LEGACY_INTERNAL_MCP_SERVER_IDS,
} from "./constants";
import {
  collectInternalToolsByAvailability,
  loadInternalToolAvailabilitySnapshot,
  shouldUpdateInternalToolAvailabilitySnapshot,
  UPDATE_INTERNAL_MCP_AVAILABILITY_SNAPSHOT_COMMAND,
  validateInternalToolAvailabilitySnapshots,
  writeInternalToolAvailabilitySnapshot,
} from "./internal_mcp_server_availability_snapshots";

describe("INTERNAL_MCP_SERVERS", () => {
  it("should have unique IDs for all servers", () => {
    const ids = Object.values(INTERNAL_MCP_SERVERS).map((server) => server.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(uniqueIds.size);
  });

  it("should not have any legacy servers", () => {
    const legacyServers = Object.values(INTERNAL_MCP_SERVERS).filter((server) =>
      LEGACY_INTERNAL_MCP_SERVER_IDS.includes(server.id)
    );
    expect(
      legacyServers.length,
      "Legacy servers should not be present in the INTERNAL_MCP_SERVERS object."
    ).toBe(0);
  });

  it("changing internal tool availability may require a migration", () => {
    const { auto: currentAuto, manual: currentManual } =
      collectInternalToolsByAvailability(INTERNAL_MCP_SERVERS);

    if (shouldUpdateInternalToolAvailabilitySnapshot()) {
      writeInternalToolAvailabilitySnapshot({
        auto: currentAuto,
        manual: currentManual,
      });
      return;
    }

    const { auto: previousAuto, manual: previousManual } =
      loadInternalToolAvailabilitySnapshot();

    const validation = validateInternalToolAvailabilitySnapshots({
      previousAuto,
      previousManual,
      currentAuto,
      currentManual,
    });

    expect(
      validation.ok,
      !validation.ok
        ? `${validation.message}\n\nTo update the snapshot:\n  ${UPDATE_INTERNAL_MCP_AVAILABILITY_SNAPSHOT_COMMAND}`
        : undefined
    ).toBe(true);
  });
});

describe("AVAILABLE_INTERNAL_MCP_SERVER_NAMES", () => {
  it("should contain unique server names", () => {
    const names = [...AVAILABLE_INTERNAL_MCP_SERVER_NAMES];
    const unique = [...new Set(names)];

    expect(names).toStrictEqual(unique);
  });
});

describe("isHotMCPServerName", () => {
  // Derive expectations from the availability source of truth so the test stays
  // valid as servers are added or their availability changes.
  it("treats every auto / auto_hidden_builder internal server as hot", () => {
    const autoNames = Object.entries(INTERNAL_MCP_SERVERS)
      .filter(([, server]) => server.availability !== "manual")
      .map(([name]) => name);

    expect(autoNames.length).toBeGreaterThan(0);
    for (const name of autoNames) {
      expect(isHotMCPServerName(name)).toBe(true);
    }
  });

  it("treats every manual internal server as cold", () => {
    const manualNames = Object.entries(INTERNAL_MCP_SERVERS)
      .filter(([, server]) => server.availability === "manual")
      .map(([name]) => name);

    expect(manualNames.length).toBeGreaterThan(0);
    for (const name of manualNames) {
      expect(isHotMCPServerName(name)).toBe(false);
    }
  });

  it("treats unknown or non-internal server names as cold", () => {
    expect(isHotMCPServerName("not_a_real_server")).toBe(false);
    expect(isHotMCPServerName("")).toBe(false);
  });
});
