import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { Authenticator } from "@app/lib/auth";
import { discoverKnowledgeSkill } from "@app/lib/resources/skill/global/discover_knowledge";
import { discoverToolsSkill } from "@app/lib/resources/skill/global/discover_tools";
import { framesSkill } from "@app/lib/resources/skill/global/frames";
import { goDeepSkill } from "@app/lib/resources/skill/global/go_deep";
import type { AllSkillConfigurationFindOptions } from "@app/lib/resources/skill/types";
import type { ResourceSId } from "@app/lib/resources/string_ids";

interface BaseGlobalSkillDefinition {
  readonly agentFacingDescription: string;
  readonly userFacingDescription: string;
  readonly name: string;
  readonly sId: string;
  readonly version: number;
  readonly icon: string;
  readonly internalMCPServerNames?: AutoInternalMCPServerNameType[];
  readonly inheritAgentConfigurationDataSources?: boolean;
  readonly isAutoEnabled?: boolean;
}

type WithStaticInstructions<T extends BaseGlobalSkillDefinition> = T & {
  readonly instructions: string;
  readonly fetchInstructions?: never;
};

type WithDynamicInstructions<T extends BaseGlobalSkillDefinition> = T & {
  readonly instructions?: never;
  readonly fetchInstructions: (
    auth: Authenticator,
    spaceIds: string[]
  ) => Promise<string>;
};

export type GlobalSkillDefinition =
  | WithStaticInstructions<BaseGlobalSkillDefinition>
  | WithDynamicInstructions<BaseGlobalSkillDefinition>;

// Helper function that enforces unique sIds.
function ensureUniqueSIds<T extends readonly GlobalSkillDefinition[]>(
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

// Registry is a simple array.
const GLOBAL_SKILLS_ARRAY = ensureUniqueSIds([
  discoverKnowledgeSkill,
  discoverToolsSkill,
  framesSkill,
  goDeepSkill,
] as const);

// Build lookup map for direct access by sId.
const GLOBAL_SKILLS_BY_ID: Map<string, GlobalSkillDefinition> = new Map(
  GLOBAL_SKILLS_ARRAY.map((skill) => [skill.sId, skill])
);

// Type derived from the actual array.
export type GlobalSkillId = (typeof GLOBAL_SKILLS_ARRAY)[number]["sId"];

function matchesFilter<T>(value: T, filter: T | T[]): boolean {
  return Array.isArray(filter) ? filter.includes(value) : value === filter;
}

export class GlobalSkillsRegistry {
  static listAll(): readonly GlobalSkillDefinition[] {
    return GLOBAL_SKILLS_ARRAY;
  }

  static getById(sId: string): GlobalSkillDefinition | undefined {
    return GLOBAL_SKILLS_BY_ID.get(sId);
  }

  static findAll(
    where: AllSkillConfigurationFindOptions["where"] = {}
  ): readonly GlobalSkillDefinition[] {
    if (!where) {
      return GLOBAL_SKILLS_ARRAY;
    }

    return GLOBAL_SKILLS_ARRAY.filter((skill) => {
      if (where.sId && !matchesFilter(skill.sId, where.sId)) {
        return false;
      }

      if (where.name && !matchesFilter(skill.name, where.name)) {
        return false;
      }

      if (where.status && where.status !== "active") {
        return false; // Global skills are always active.
      }

      return true;
    });
  }

  static isSkillAutoEnabled(sId: string): boolean {
    return this.getById(sId)?.isAutoEnabled ?? false;
  }

  static doesSkillInheritAgentConfigurationDataSources(sId: string): boolean {
    return this.getById(sId)?.inheritAgentConfigurationDataSources ?? false;
  }
}
