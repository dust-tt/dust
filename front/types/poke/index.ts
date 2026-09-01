import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import type { AgentMessageCreditsBreakdown } from "@app/lib/api/assistant/credit_cost";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import type { RegionType } from "@app/types/region";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "../assistant/conversation";
import type { ContentFragmentType } from "../content_fragment";
import type { DataSourceType } from "../data_source";
import type { DataSourceViewType } from "../data_source_view";
import type { GroupType } from "../groups";
import type { ModelId } from "../shared/model_id";
import type { SpaceType } from "../space";

type PokeItemType =
  | "Workspace"
  | "Data Source"
  | "Data Source View"
  | "Connector"
  | "MCP Server View"
  | "Frame"
  | "File"
  | "Group"
  | "Skill"
  | "Space"
  | "Webhook Source";

export interface PokeItemBase {
  id: ModelId;
  link: string | null;
  name: string;
  type: PokeItemType;
  region?: RegionType;
}

export type PokeSpaceType = SpaceType & {
  id: ModelId;
  groups: GroupType[];
  isRestricted: boolean;
};

export type PokeSandboxType = {
  providerId: string;
  status: SandboxStatus;
};

export type PokeDataSourceType = DataSourceType &
  PokeItemBase & {
    space: PokeSpaceType;
  };

export type PokeDataSourceViewType = DataSourceViewType &
  PokeItemBase & {
    dataSource: PokeDataSourceType;
    space: PokeSpaceType;
  };

export type PokeMCPServerViewType = MCPServerViewType &
  PokeItemBase & {
    customName: string | null;
    space: PokeSpaceType;
    connections: {
      connectionType: "workspace" | "personal";
      userId: string | null;
      userFullName: string | null;
      userEmail: string | null;
    }[];
  };

type PokeAgentActionType = AgentMessageType["actions"][number] & {
  runId?: string | null;
  appWorkspaceId?: string | null;
  appSpaceId?: string | null;
  appId?: string | null;
  created?: number;
  mcpIO?: {
    params: Record<string, unknown>;
    output: CallToolResult["content"] | null;
    generatedFiles: ActionGeneratedFileType[];
    isError: boolean;
  };
};

export type PokeAgentMessageType = Omit<AgentMessageType, "actions"> & {
  runIds?: string[] | null;
  runUrls?: { runId: string; url: string; isLLM: boolean }[] | null;
  actions: PokeAgentActionType[];
  // LLM + tool cost breakdown as computed by the billing pipeline at run time,
  // read back from the message's stored consumption analytics documents (as opposed to
  // `costCredits`/`subAgentCostCredits`, the values persisted for billing itself).
  // Poke-only, for auditing. Undefined when no analytics documents are available yet.
  costBreakdown?: AgentMessageCreditsBreakdown;
};

export type PokeConversationType = Omit<ConversationType, "content"> & {
  content: (
    | UserMessageType[]
    | PokeAgentMessageType[]
    | ContentFragmentType[]
  )[];
};
