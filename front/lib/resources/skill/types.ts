import type {
  SkillConfigurationModel,
  SkillDataSourceConfigurationModel,
} from "@app/lib/models/skill";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { SkillStatus } from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";

// Fields identifying a skill in related tables (e.g., AgentSkillModel,
// ConversationSkillModel).
export type SkillReferenceFields =
  | { globalSkillId: string }
  | { customSkillId: ModelId };

export type SkillMCPServerConfiguration = {
  view: MCPServerViewResource;
  childAgentId?: string;
  serverNameOverride?: string;
};

export interface SkillAttachedKnowledge {
  dataSourceView: DataSourceViewResource;
  nodeId: string;
}

export type SkillResourceConstructorOptions =
  | {
      // For global skills, there is no editor group.
      dataSourceConfigurations: SkillDataSourceConfigurationModel[];
      editorGroup?: undefined;
      // When true, the global skill's instructions are exposed to the front-end.
      exposeInstructions?: boolean;
      fileAttachments: FileResource[];
      globalSId: string;
      mcpServerConfigurations: SkillMCPServerConfiguration[];
      version?: number;
    }
  | {
      dataSourceConfigurations: SkillDataSourceConfigurationModel[];
      editorGroup?: GroupResource;
      // Custom skills always expose their own instructions; this flag is unused.
      exposeInstructions?: undefined;
      fileAttachments: FileResource[];
      globalSId?: undefined;
      mcpServerConfigurations: SkillMCPServerConfiguration[];
      version?: number;
    };

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
    isDefault?: boolean;
  };
  onlyCustom?: false; // Default: include global skills.
  withTools?: boolean;
  withInstructions?: boolean;
};

// Full find options only custom skills from database.
type CustomSkillConfigurationFindOptions =
  ResourceFindOptions<SkillConfigurationModel> & {
    onlyCustom: true; // Explicit: only custom skills.
    withTools?: boolean;
    withInstructions?: boolean;
  };

export type SkillConfigurationFindOptions =
  | AllSkillConfigurationFindOptions
  | CustomSkillConfigurationFindOptions;
