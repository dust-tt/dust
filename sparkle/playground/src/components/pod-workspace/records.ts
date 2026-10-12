import { ClipboardCheck, Zap } from "@dust-tt/sparkle";
import { z } from "zod";

import {
  mockManagedAgents,
  mockManagedSkills,
  mockTools,
  type ManagedAgent,
  type ManagedSkill,
  type MockTool,
} from "../../data/build";
import type { WorkspaceFile } from "./model";

export type FrameRecord = { id: string; version: number; updatedAt: string };
export type WorkspaceRecords = {
  agents: Record<string, ManagedAgent>;
  skills: Record<string, ManagedSkill>;
  tools: Record<string, MockTool>;
  frames: Record<string, FrameRecord>;
};

export function createWorkspaceRecords(): WorkspaceRecords {
  return {
    agents: Object.fromEntries(
      mockManagedAgents.map((agent) => [
        agent.id,
        {
          ...agent,
          ...(agent.id === "agent-4" || agent.id === "agent-5"
            ? {
                skillIds:
                  agent.id === "agent-4"
                    ? ["skill-brand-check", "skill-pr-review"]
                    : ["skill-brand-check"],
                emoji: agent.id === "agent-4" ? "🚀" : "🔎",
                spaceIds: [],
                editorIds: ["1", "2"],
              }
            : {}),
        },
      ])
    ),
    skills: Object.fromEntries(
      mockManagedSkills.map((skill) => [
        skill.id,
        {
          ...skill,
          ...(skill.id === "skill-brand-check" || skill.id === "skill-pr-review"
            ? {
                toolIds:
                  skill.id === "skill-pr-review" ? ["tool-crm"] : ["tool-gong"],
                spaceIds: [],
                icon:
                  skill.id === "skill-pr-review" ? ClipboardCheck : skill.icon,
                usedByAgentIds: ["agent-4"],
                editorIds: ["1"],
              }
            : {}),
        },
      ])
    ),
    tools: Object.fromEntries([
      ...mockTools.map((tool) => [
        tool.id,
        {
          ...tool,
          isConnected: true,
          isWorkspaceWide: true,
          spaceIds: [],
          editorId: "1",
          usedByAgentIds: ["agent-5"],
        },
      ]),
      ...[
        {
          id: "tool-gong",
          name: "Gong",
          operations: [
            ["read_call", "Read a customer call and its transcript"],
          ],
        },
        {
          id: "tool-crm",
          name: "HubSpot",
          operations: [
            ["read_account", "Read an account or opportunity record"],
          ],
        },
        {
          id: "tool-gmail",
          name: "Gmail",
          operations: [["read_email", "Read customer email"]],
        },
      ].map((tool) => [
        tool.id,
        {
          ...mockTools[0],
          ...tool,
          icon: Zap,
          serverUrl: null,
          isWorkspaceWide: true,
          spaceIds: [],
          isConnected: true,
          isRestrictedToSkills: false,
          editorId: "1",
          usedByAgentIds: ["agent-4", "agent-5"],
          operations: tool.operations.map(([name, description]) => ({
            name,
            description,
            enabled: true,
            stake: "low" as const,
          })),
        },
      ]),
    ]),
    frames: {
      "frame-tender": {
        id: "frame-tender",
        version: 1,
        updatedAt: "October 6, 2026",
      },
      "frame-voc": {
        id: "frame-voc",
        version: 1,
        updatedAt: "October 6, 2026",
      },
    },
  };
}

export function resolveAgent(
  file: WorkspaceFile,
  records: WorkspaceRecords
): ManagedAgent | undefined {
  const record = file.recordId ? records.agents[file.recordId] : undefined;
  return record
    ? {
        ...record,
        name: file.name,
        description: file.description,
        instructions: file.content,
      }
    : undefined;
}

export function resolveSkill(
  file: WorkspaceFile,
  records: WorkspaceRecords
): ManagedSkill | undefined {
  const record = file.recordId ? records.skills[file.recordId] : undefined;
  return record
    ? {
        ...record,
        name: file.name,
        description: file.description,
        guidelines: file.content,
      }
    : undefined;
}

export function resolveTool(
  file: WorkspaceFile,
  records: WorkspaceRecords
): MockTool | undefined {
  const record = file.recordId ? records.tools[file.recordId] : undefined;
  return record
    ? { ...record, name: file.name, description: file.description }
    : undefined;
}

export function exportToolSettings(records: WorkspaceRecords) {
  return Object.fromEntries(
    Object.entries(records.tools).map(([id, tool]) => [
      id,
      {
        name: tool.name,
        description: tool.description,
        iconName: tool.iconName,
        isRestrictedToSkills: tool.isRestrictedToSkills,
        isConnected: tool.isConnected,
        isWorkspaceWide: tool.isWorkspaceWide,
        spaceIds: tool.spaceIds,
        operations: tool.operations,
      },
    ])
  );
}

const toolSettingsSchema = z.record(
  z.object({
    name: z.string(),
    description: z.string(),
    iconName: z.string().nullable(),
    isRestrictedToSkills: z.boolean(),
    isConnected: z.boolean(),
    isWorkspaceWide: z.boolean(),
    spaceIds: z.array(z.string()),
    operations: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        enabled: z.boolean(),
        stake: z.enum(["high", "medium", "low", "never_ask"]),
      })
    ),
  })
);
function isToolSettings(
  value: unknown
): value is ReturnType<typeof exportToolSettings> {
  return toolSettingsSchema.safeParse(value).success;
}
export function restoreToolSettings(raw: string): WorkspaceRecords {
  const parsed: unknown = JSON.parse(raw);
  if (!isToolSettings(parsed)) {
    throw new Error("Saved tool settings are invalid.");
  }
  const base = createWorkspaceRecords();
  return {
    ...base,
    tools: Object.fromEntries(
      Object.entries(base.tools).map(([id, tool]) => [
        id,
        { ...tool, ...parsed[id] },
      ])
    ),
  };
}
