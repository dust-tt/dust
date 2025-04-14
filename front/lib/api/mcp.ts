import type { JSONSchema7 as JSONSchema } from "json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { AllowedIconType } from "@app/lib/actions/mcp_icons";
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

export type MCPToolWithStakeLevelType = MCPToolWithIsDefaultType & {
  stakeLevel?: MCPToolStakeLevelType;
  toolServerId?: string;
};

export type MCPServerType = {
  id: string;
  name: string;
  version: string;
  description: string;
  visual: AllowedIconType | `https://${string}`;
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
  visual: `https://${string}`; // We enforce that we pass a URL here.
};

export type InternalMCPServerDefinitionType = Omit<
  InternalMCPServerType,
  "tools" | "id" | "isDefault"
>;

export type MCPServerTypeWithViews = MCPServerType & {
  views: MCPServerViewType[];
};
