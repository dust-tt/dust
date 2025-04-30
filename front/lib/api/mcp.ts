import type { JSONSchema7 as JSONSchema } from "json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type {
  InternalAllowedIconType,
  RemoteAllowedIconType,
} from "@app/lib/actions/mcp_icons";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { EditedByUser } from "@app/types";

export type MCPToolType = {
  name: string;
  description: string;
  inputSchema: JSONSchema | undefined;
};

export type MCPToolWithIsDefaultType = MCPToolType & {
  isDefault: boolean;
};

export type WithStakeLevelType<T> = T & {
  stakeLevel: MCPToolStakeLevelType;
};

export type PlatformMCPToolTypeWithStakeLevel =
  WithStakeLevelType<MCPToolWithIsDefaultType> & {
    toolServerId: string;
  };

export type LocalMCPToolTypeWithStakeLevel =
  WithStakeLevelType<MCPToolWithIsDefaultType>;

export type MCPToolWithStakeLevelType =
  | PlatformMCPToolTypeWithStakeLevel
  | LocalMCPToolTypeWithStakeLevel;

export type MCPServerType = {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: RemoteAllowedIconType | InternalAllowedIconType;
  authorization: AuthorizationInfo | null;
  tools: MCPToolType[];
  isDefault: boolean;
};

export type RemoteMCPServerType = MCPServerType & {
  url?: string;
  cachedName?: string;
  cachedDescription?: string | null;
  sharedSecret?: string;
  lastSyncAt?: Date | null;
  icon: RemoteAllowedIconType; // We enforce that we pass an icon here (among the ones we allow).
};

export interface MCPServerViewType {
  id: string;
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  server: MCPServerType;
  editedByUser: EditedByUser | null;
}

export type MCPServerDefinitionType = Omit<
  MCPServerType,
  "tools" | "id" | "isDefault"
>;

type InternalMCPServerType = MCPServerType & {
  name: InternalMCPServerNameType;
  icon: InternalAllowedIconType; // We enforce that we pass an icon here.
};

export type InternalMCPServerDefinitionType = Omit<
  InternalMCPServerType,
  "tools" | "id" | "isDefault"
>;

export type MCPServerTypeWithViews = MCPServerType & {
  views: MCPServerViewType[];
};

// TODO(MCP2025-04-30) Temporary token to identify MCP progress notifications.
// As of now `progressToken` is not accessible in the `ToolCallback` interface. PR has been merged,
// but not released yet (https://github.com/modelcontextprotocol/typescript-sdk/pull/328).
export const MCP_PROGRESS_TOKEN = 0;
