import { framesSkill } from "@app/lib/resources/skill/global/frames";
import type { AllSkillConfigurationFindOptions } from "@app/lib/resources/skill/types";
import type { UserType } from "@app/types";

export interface GlobalSkillDefinition {
  readonly description: string;
  readonly instructions: string;
  readonly name: string;
  readonly sId: string;
  readonly version: number;
}

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
const GLOBAL_SKILLS_ARRAY = ensureUniqueSIds([framesSkill] as const);

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
}

export const GLOBAL_DUST_AUTHOR: UserType = {
  sId: "dust",
  id: -1,
  createdAt: 0,
  provider: "github",
  username: "dust",
  email: "",
  firstName: "Dust",
  lastName: null,
  fullName: "Dust",
  image: "https://dust.tt/static/systemavatar/dust_avatar_full.png",
  lastLoginAt: null,
};
