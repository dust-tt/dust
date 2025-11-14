import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import type { MCPServerViewType } from "@app/lib/api/mcp";

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
  | "MCP Server View";

export interface PokeItemBase {
  id: ModelId;
  link: string | null;
  name: string;
  type: PokeItemType;
}

export type PokeSpaceType = SpaceType & {
  id: ModelId;
  groups: GroupType[];
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
    space: PokeSpaceType;
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
};

export type PokeConversationType = Omit<ConversationType, "content"> & {
  content: (
    | UserMessageType[]
    | PokeAgentMessageType[]
    | ContentFragmentType[]
  )[];
};
