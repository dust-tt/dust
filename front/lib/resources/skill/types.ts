import type { Authenticator } from "@app/lib/auth";
import type {
  SkillConfigurationModel,
  SkillDataSourceConfigurationModel,
} from "@app/lib/models/skill";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { CodeDefinedSkillFile } from "@app/lib/resources/skill/code_defined/shared";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type {
  SkillAvailability,
  SkillStatus,
} from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// Constrained find options include both global and custom skills.
export type AllSkillConfigurationFindOptions = Omit<
  ResourceFindOptions<SkillConfigurationModel>,
  "limit" | "offset" | "where"
> & {
  where?: {
    name?: string | string[];
    sId?: string | string[];
    id?: number | number[];
    status?: SkillStatus | SkillStatus[];
    availability?: SkillAvailability | SkillAvailability[];
  };
  onlyCustom?: false; // Default: include global skills.
};

// Full find options only custom skills from database.
type CustomSkillConfigurationFindOptions =
  ResourceFindOptions<SkillConfigurationModel> & {
    onlyCustom: true; // Explicit: only custom skills.
  };

// Which satellite data a skill fetch loads. Everything but `withToolMetadata` defaults to true,
// so a caller that needs less has to opt out.
export type SkillHydrationOptions = {
  withTools?: boolean;
  withToolMetadata?: boolean;
  withInstructions?: boolean;
  withFileAttachments?: boolean;
};

// baseFetch controls the selected model attributes based on hydration options
// such as withInstructions.
export type SkillConfigurationFindOptions = (
  | Omit<AllSkillConfigurationFindOptions, "attributes">
  | Omit<CustomSkillConfigurationFindOptions, "attributes">
) &
  SkillHydrationOptions;

export type SkillMCPServerConfiguration = {
  view: MCPServerViewResource;
  childAgentId?: string;
  serverNameOverride?: string;
};

// How the fetch path treats custom skills the caller cannot read (row ACL or requested spaces):
// - "strict" (default): drop them.
// - "redact_unreadable": keep them with private fields redacted. Admins only.
// - "dangerously_skip": keep them as is, for callers that must preserve a skill without gaining
//   access to what its spaces protect (e.g. an admin re-saving an agent they do not edit).
export type SkillPermissionFilteringMode =
  | "strict"
  | "redact_unreadable"
  | "dangerously_skip";

export type SkillFetchContext = {
  permissionFiltering?: SkillPermissionFilteringMode;
} & (
  | {
      agentLoopData?: AgentLoopExecutionData;
      effectiveSpaceIds: string[];
    }
  | {
      agentLoopData?: never;
      effectiveSpaceIds?: string[];
    }
);

export interface SkillAttachedKnowledge {
  dataSourceView: DataSourceViewResource;
  nodeId: string;
}

export type SkillResourceConstructorOptions =
  | {
      codeDefinedSkillId: string;
      dataSourceConfigurations: SkillDataSourceConfigurationModel[];
      // When true, the global skill's instructions are exposed to the front-end.
      exposeInstructions?: boolean;
      fileAttachments: FileResource[];
      // Files that ship with a code-defined skill (addressable, not embedded).
      files?: readonly CodeDefinedSkillFile[];
      mcpServerConfigurations: SkillMCPServerConfiguration[];
      version?: number;
    }
  | {
      codeDefinedSkillId?: undefined;
      dataSourceConfigurations: SkillDataSourceConfigurationModel[];
      // Custom skills always expose their own instructions; this flag is unused.
      exposeInstructions?: undefined;
      fileAttachments: FileResource[];
      files?: readonly CodeDefinedSkillFile[];
      mcpServerConfigurations: SkillMCPServerConfiguration[];
      version?: number;
    };

export type SkillResourceFactory = (
  model: ModelStatic<SkillConfigurationModel>,
  blob: Attributes<SkillConfigurationModel>,
  options: SkillResourceConstructorOptions,
  redactedForCaller?: boolean
) => SkillResource;

export type SkillFetcher = (
  auth: Authenticator,
  options?: SkillConfigurationFindOptions,
  context?: {
    agentLoopData?: AgentLoopExecutionData;
    effectiveSpaceIds?: string[];
    permissionFiltering?: SkillPermissionFilteringMode;
    transaction?: Transaction;
  }
) => Promise<SkillResource[]>;

export type SkillReferenceFetcher = (
  auth: Authenticator,
  refs: {
    customSkillId: ModelId | null;
    globalSkillId: string | null;
  }[],
  options?: SkillHydrationOptions & {
    agentLoopData?: AgentLoopExecutionData;
    effectiveSpaceIds?: string[];
    permissionFiltering?: SkillPermissionFilteringMode;
    status?: SkillStatus | SkillStatus[];
    transaction?: Transaction;
  }
) => Promise<SkillResource[]>;

export type SkillPermissionFilter = (
  auth: Authenticator,
  skills: SkillConfigurationModel[],
  options?: { transaction?: Transaction }
) => Promise<SkillConfigurationModel[]>;
