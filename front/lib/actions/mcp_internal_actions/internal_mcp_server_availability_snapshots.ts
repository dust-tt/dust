import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";

export const INTERNAL_MCP_SERVER_AVAILABILITY_SNAPSHOT_FILE =
  "internal_mcp_server_availability.snapshot.json";

export const UPDATE_INTERNAL_MCP_AVAILABILITY_SNAPSHOT_ENV =
  "UPDATE_INTERNAL_MCP_AVAILABILITY_SNAPSHOT";

export const UPDATE_INTERNAL_MCP_AVAILABILITY_SNAPSHOT_COMMAND =
  "npm run test:update-internal-mcp-availability-snapshot";

const SNAPSHOT_DIR = path.dirname(fileURLToPath(import.meta.url));

export type InternalToolSnapshot = {
  name: InternalMCPServerNameType | string;
  id: number;
};

export const MIGRATE_LEGACY_MANUAL_TO_AUTO_SCRIPT =
  "scripts/migrate_legacy_manual_internal_mcp_server_ids_to_auto.ts";

export const ENSURE_AUTO_MCP_SERVER_VIEWS_SCRIPT =
  "scripts/ensure_all_mcp_server_views_created.ts";

type InternalToolAvailabilitySnapshot = {
  auto: InternalToolSnapshot[];
  manual: InternalToolSnapshot[];
};

export function collectInternalToolsByAvailability(servers: {
  [key: string]: { id: number; availability: string };
}): InternalToolAvailabilitySnapshot {
  const auto: InternalToolSnapshot[] = [];
  const manual: InternalToolSnapshot[] = [];

  for (const [name, server] of Object.entries(servers)) {
    const entry = { name, id: server.id };
    if (
      server.availability === "auto" ||
      server.availability === "auto_hidden_builder"
    ) {
      auto.push(entry);
    } else if (server.availability === "manual") {
      manual.push(entry);
    }
  }

  const sortById = (a: InternalToolSnapshot, b: InternalToolSnapshot) =>
    a.id - b.id;

  auto.sort(sortById);
  manual.sort(sortById);

  return { auto, manual };
}

export function getInternalToolAvailabilitySnapshotPath(): string {
  return path.join(
    SNAPSHOT_DIR,
    INTERNAL_MCP_SERVER_AVAILABILITY_SNAPSHOT_FILE
  );
}

export function loadInternalToolAvailabilitySnapshot(): InternalToolAvailabilitySnapshot {
  const snapshotPath = getInternalToolAvailabilitySnapshotPath();
  const content = fs.readFileSync(snapshotPath, "utf-8");
  return JSON.parse(content) as InternalToolAvailabilitySnapshot;
}

export function writeInternalToolAvailabilitySnapshot(
  snapshot: InternalToolAvailabilitySnapshot
): void {
  fs.writeFileSync(
    getInternalToolAvailabilitySnapshotPath(),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf-8"
  );
}

export function shouldUpdateInternalToolAvailabilitySnapshot(): boolean {
  return process.env[UPDATE_INTERNAL_MCP_AVAILABILITY_SNAPSHOT_ENV] === "1";
}

function snapshotByName(
  tools: InternalToolSnapshot[]
): Map<string, InternalToolSnapshot> {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

export function detectAvailabilityChanges(
  previous: InternalToolAvailabilitySnapshot,
  current: InternalToolAvailabilitySnapshot
): {
  movedToAuto: InternalToolSnapshot[];
  movedToManual: InternalToolSnapshot[];
  newAutoTools: InternalToolSnapshot[];
  newManualTools: InternalToolSnapshot[];
} {
  const previousAutoByName = snapshotByName(previous.auto);
  const previousManualByName = snapshotByName(previous.manual);

  const movedToAuto = current.auto.filter((tool) =>
    previousManualByName.has(tool.name)
  );
  const movedToManual = current.manual.filter((tool) =>
    previousAutoByName.has(tool.name)
  );
  const newAutoTools = current.auto.filter(
    (tool) =>
      !previousAutoByName.has(tool.name) && !previousManualByName.has(tool.name)
  );
  const newManualTools = current.manual.filter(
    (tool) =>
      !previousAutoByName.has(tool.name) && !previousManualByName.has(tool.name)
  );

  return { movedToAuto, movedToManual, newAutoTools, newManualTools };
}

export function validateInternalToolAvailabilitySnapshots({
  previousAuto,
  previousManual,
  currentAuto,
  currentManual,
}: {
  previousAuto: InternalToolSnapshot[];
  previousManual: InternalToolSnapshot[];
  currentAuto: InternalToolSnapshot[];
  currentManual: InternalToolSnapshot[];
}): { ok: true } | { ok: false; message: string } {
  const { movedToAuto, movedToManual, newAutoTools, newManualTools } =
    detectAvailabilityChanges(
      { auto: previousAuto, manual: previousManual },
      { auto: currentAuto, manual: currentManual }
    );

  if (movedToAuto.length > 0) {
    const toolNames = movedToAuto.map((tool) => tool.name).join(", ");
    return {
      ok: false,
      message:
        `Internal tool(s) moved from manual to auto: ${toolNames}.\n` +
        "Workspaces that manually installed these tools may have legacy random-prefix internal MCP server sIds.\n" +
        "Run the migration script before merging:\n" +
        `  npx tsx ${MIGRATE_LEGACY_MANUAL_TO_AUTO_SCRIPT} --scanOnly\n` +
        `  npx tsx ${MIGRATE_LEGACY_MANUAL_TO_AUTO_SCRIPT} --execute`,
    };
  }

  if (movedToManual.length > 0) {
    const toolNames = movedToManual.map((tool) => tool.name).join(", ");
    return {
      ok: false,
      message:
        `Internal tool(s) moved from auto to manual: ${toolNames}.\n` +
        "Migrate existing agents that were configured with that tool to update their requestedGroupIds (see getAgentConfigurationGroupIdsFromActions()).",
    };
  }

  if (newAutoTools.length > 0) {
    const toolNames = newAutoTools.map((tool) => tool.name).join(", ");
    return {
      ok: false,
      message:
        `New auto internal tool(s) added: ${toolNames}.\n` +
        "Ensure MCP server views exist across workspaces:\n" +
        `  npx tsx ${ENSURE_AUTO_MCP_SERVER_VIEWS_SCRIPT} --execute`,
    };
  }

  if (newManualTools.length > 0) {
    const toolNames = newManualTools.map((tool) => tool.name).join(", ");
    return {
      ok: false,
      message:
        `New manual internal tool(s) added: ${toolNames}.\n` +
        "Update the availability snapshot:\n" +
        `  ${UPDATE_INTERNAL_MCP_AVAILABILITY_SNAPSHOT_COMMAND}`,
    };
  }

  const autoMatches =
    JSON.stringify(currentAuto) === JSON.stringify(previousAuto);
  const manualMatches =
    JSON.stringify(currentManual) === JSON.stringify(previousManual);

  if (!autoMatches || !manualMatches) {
    return {
      ok: false,
      message:
        "Internal tool availability snapshot is out of date.\n" +
        "Update the snapshot:\n" +
        `  ${UPDATE_INTERNAL_MCP_AVAILABILITY_SNAPSHOT_COMMAND}`,
    };
  }

  return { ok: true };
}
