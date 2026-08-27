import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { Authenticator } from "@app/lib/auth";
import type { AllSkillConfigurationFindOptions } from "@app/lib/resources/skill/types";
import type { ResourceSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
import { removeNulls } from "@app/types/shared/utils/general";

export const SKILL_COMPANY_DATA_SERVER_NAME = "company_data";

type MCPServerDefinition = {
  name: AutoInternalMCPServerNameType;
  childAgentId?: string;
  serverNameOverride?: string;
};

type SkillAgentLoopState = "enabled" | "equipped";

interface BaseSkillDefinition<
  T extends SkillAgentLoopState = SkillAgentLoopState,
> {
  readonly agentFacingDescription: string;
  readonly userFacingDescription: string;
  readonly kind: "global" | "system";
  readonly name: string;
  readonly sId: string;
  readonly version: number;
  readonly icon: string;
  // Files that ship with the skill and are loaded into the conversation file
  // system when the skill is enabled, exactly like custom-skill attachments.
  readonly files?: readonly CodeDefinedSkillFile[];
  readonly inheritAgentConfigurationDataSources?: boolean;
  // When true, the skill's instructions are exposed to the front-end so builders
  // can read them in the skill details panel and build on top of the skill.
  // Defaults to false: code-defined skill instructions are hidden by default and
  // opted in per skill (e.g. docs/pptx/xlsx). System skills stay hidden.
  readonly exposeInstructions?: boolean;
  readonly isRestricted?: (auth: Authenticator) => Promise<boolean>;
  // Optional callback to auto-add a code-defined skill for an agent loop
  // (subject to isRestricted), without adding it to the agent configuration.
  // For global skills, returning "enabled" promotes it to a system skill.
  readonly getAutoEnabledOrEquippedForAgentLoop?: (params: {
    agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
    conversation: ConversationWithoutContentType;
  }) => T | undefined;
  // Optional callback to hide a skill from a given agent loop (both from equipped and enabled).
  readonly isDisabledForAgentLoop?: (
    agentLoopData: AgentLoopExecutionData
  ) => boolean;
}

type WithMCPServers<T extends BaseSkillDefinition> =
  | (T & {
      readonly mcpServers?: MCPServerDefinition[];
      readonly fetchMCPServers?: never;
    })
  | (T & {
      readonly mcpServers?: never;
      readonly fetchMCPServers: (
        auth: Authenticator
      ) => Promise<MCPServerDefinition[]>;
    });

export type CodeDefinedSkillFile = {
  // Unique within the skill; becomes the file name under `skills/<skillName>/`.
  readonly fileName: string;
  readonly contentType: string;
  readonly content: string;
};

type WithStaticInstructions<T extends BaseSkillDefinition> =
  WithMCPServers<T> & {
    readonly instructions: string;
    readonly fetchInstructions?: never;
  };

type WithDynamicInstructions<T extends BaseSkillDefinition> =
  WithMCPServers<T> & {
    readonly instructions?: never;
    readonly fetchInstructions: (
      auth: Authenticator,
      params: {
        spaceIds: string[];
        agentLoopData?: AgentLoopExecutionData;
      }
    ) => Promise<string>;
  };

export type SkillDefinition<
  T extends SkillAgentLoopState = SkillAgentLoopState,
> =
  | WithStaticInstructions<BaseSkillDefinition<T>>
  | WithDynamicInstructions<BaseSkillDefinition<T>>;

export type GlobalSkillDefinition = SkillDefinition & {
  readonly kind: "global";
};
// System skills have no definition of "equipped". When they are present they are directly part of the system prompt.
export type SystemSkillDefinition = SkillDefinition<"enabled"> & {
  readonly kind: "system";
};

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
  { availability }: { availability: SkillAvailability }
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

    if (
      where.availability !== undefined &&
      !matchesFilter(availability, where.availability)
    ) {
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
