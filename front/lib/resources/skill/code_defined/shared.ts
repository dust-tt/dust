import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { Authenticator } from "@app/lib/auth";
import type { AllSkillConfigurationFindOptions } from "@app/lib/resources/skill/types";
import type { ResourceSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { removeNulls } from "@app/types/shared/utils/general";

export type MCPServerDefinition = {
  name: AutoInternalMCPServerNameType;
  childAgentId?: string;
  serverNameOverride?: string;
};

interface BaseSkillDefinition {
  readonly agentFacingDescription: string;
  readonly userFacingDescription: string;
  readonly name: string;
  readonly sId: string;
  readonly version: number;
  readonly icon: string;
  readonly mcpServers?: MCPServerDefinition[];
  readonly inheritAgentConfigurationDataSources?: boolean;
  readonly isRestricted?: (auth: Authenticator) => Promise<boolean>;
  // Optional callback to hide a skill from a given agent loop (both from equipped and enabled).
  readonly isDisabledForAgentLoop?: (
    agentLoopData: AgentLoopExecutionData
  ) => boolean;
}

type WithStaticInstructions<T extends BaseSkillDefinition> = T & {
  readonly instructions: string;
  readonly fetchInstructions?: never;
};

type WithDynamicInstructions<T extends BaseSkillDefinition> = T & {
  readonly instructions?: never;
  readonly fetchInstructions: (
    auth: Authenticator,
    params: {
      spaceIds: string[];
      agentLoopData?: AgentLoopExecutionData;
    }
  ) => Promise<string>;
};

export type SkillDefinition =
  | WithStaticInstructions<BaseSkillDefinition>
  | WithDynamicInstructions<BaseSkillDefinition>;

export type GlobalSkillDefinition = SkillDefinition;
export type SystemSkillDefinition = SkillDefinition;

// Helper function that enforces unique sIds.
export function ensureUniqueSIds<T extends readonly SkillDefinition[]>(
  skills: readonly [...T] & {
    // For each element in the array (I = index).
    [I in keyof T]: {
      // For each property in that element (K = property key).
      [K in keyof T[I]]: K extends "sId"
        ? // Only check sId properties for duplicates.
          T[I][K] extends {
            // Build object of all OTHER elements (exclude current index I).
            [J in keyof T]: J extends I ? never : T[J];
          }[number]["sId"] // Extract their sId values as a union.
          ? // If current sId matches any other element's sId, return error.
            `ERROR: Duplicate sId detected: \${T[I][K] & string}`
          : // Ensure it does not start with skl_ to avoid conflicts with custom skills.
            T[I][K] extends ResourceSId
            ? "ERROR: sId cannot start with resource prefix"
            : // Otherwise, return the original sId type.
              T[I][K]
        : // For non-sId properties, just pass through unchanged.
          T[I][K];
    };
  }
): T {
  return skills as T;
}

function matchesFilter<T>(value: T, filter: T | T[]): boolean {
  return Array.isArray(filter) ? filter.includes(value) : value === filter;
}

export async function filterSkillDefinitions<T extends SkillDefinition>(
  auth: Authenticator,
  skills: readonly T[],
  where: AllSkillConfigurationFindOptions["where"] = {},
  { isDefault }: { isDefault: boolean }
): Promise<T[]> {
  const filteredSkills = skills.filter((skill) => {
    if (where.sId && !matchesFilter(skill.sId, where.sId)) {
      return false;
    }

    if (where.name && !matchesFilter(skill.name, where.name)) {
      return false;
    }

    if (where.status && !matchesFilter("active", where.status)) {
      return false; // Code-defined skills are always active.
    }

    if (where.isDefault !== undefined && where.isDefault !== isDefault) {
      return false;
    }

    return true;
  });

  const allowedSkills = await concurrentExecutor(
    filteredSkills,
    async (skill) => {
      if (skill.isRestricted) {
        const restricted = await skill.isRestricted(auth);
        if (restricted) {
          return null;
        }
      }

      return skill;
    },
    {
      concurrency: 5,
    }
  );

  return removeNulls(allowedSkills);
}
