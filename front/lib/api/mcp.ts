import type { JSONSchema7 as JSONSchema } from "json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type {
  CustomServerIconType,
  InternalAllowedIconType,
} from "@app/lib/actions/mcp_icons";
import type {
  InternalMCPServerNameType,
  MCPServerAvailability,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { EditedByUser, MCPOAuthUseCase, ModelId } from "@app/types";

export type MCPToolType = {
  name: string;
  description: string;
  inputSchema: JSONSchema | undefined;
};

export type MCPToolWithAvailabilityType = MCPToolType & {
  availability: MCPServerAvailability;
};

export type WithStakeLevelType<T> = T & {
  stakeLevel: MCPToolStakeLevelType;
};

export type ServerSideMCPToolTypeWithStakeLevel =
  WithStakeLevelType<MCPToolWithAvailabilityType> & {
    toolServerId: string;
    timeoutMs?: number;
  };

export type ClientSideMCPToolTypeWithStakeLevel =
  WithStakeLevelType<MCPToolWithAvailabilityType>;

export type MCPToolWithStakeLevelType =
  | ServerSideMCPToolTypeWithStakeLevel
  | ClientSideMCPToolTypeWithStakeLevel;

export type MCPServerType = {
  sId: string;
  name: string;
  version: string;
  description: string;
  icon: CustomServerIconType | InternalAllowedIconType;
  authorization: AuthorizationInfo | null;
  tools: MCPToolType[];
  availability: MCPServerAvailability;
  documentationUrl: string | null;
};

export type RemoteMCPServerType = MCPServerType & {
  url?: string;
  sharedSecret?: string | null;
  lastSyncAt?: Date | null;
  lastError?: string | null;
  icon: CustomServerIconType | InternalAllowedIconType;
};

export interface MCPServerViewType {
  id: ModelId;
  sId: string;
  name: string | null; // Can be null if the user did not set a custom name.
  description: string | null; // Can be null if the user did not set a custom description.
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  serverType: "remote" | "internal";
  server: MCPServerType;
  oAuthUseCase: MCPOAuthUseCase | null;
  editedByUser: EditedByUser | null;
}

export type MCPServerDefinitionType = Omit<
  MCPServerType,
  "tools" | "sId" | "availability"
>;

type InternalMCPServerType = MCPServerType & {
  name: InternalMCPServerNameType;
  icon: InternalAllowedIconType; // We enforce that we pass an icon here.
};

export type InternalMCPServerDefinitionType = Omit<
  InternalMCPServerType,
  "tools" | "sId" | "availability"
>;

export type MCPServerTypeWithViews = MCPServerType & {
  views: MCPServerViewType[];
};
