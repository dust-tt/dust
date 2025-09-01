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
  inputSchema?: JSONSchema;
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
  allowMultipleInstances: boolean;
  documentationUrl: string | null;
  flavors?: InternalMCPServerFlavorType[] | undefined;
};

export type RemoteMCPServerType = MCPServerType & {
  url?: string;
  sharedSecret?: string | null;
  lastSyncAt?: Date | null;
  lastError?: string | null;
  icon: CustomServerIconType | InternalAllowedIconType;
  // Always manual and allow multiple instances.
  availability: "manual";
  allowMultipleInstances: true;
};

export type MCPServerViewTypeType = "remote" | "internal";

export interface MCPServerViewType {
  id: ModelId;
  sId: string;
  name: string | null; // Can be null if the user did not set a custom name.
  description: string | null; // Can be null if the user did not set a custom description.
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  serverType: MCPServerViewTypeType;
  server: MCPServerType;
  oAuthUseCase: MCPOAuthUseCase | null;
  editedByUser: EditedByUser | null;
}

export type MCPServerDefinitionType = Omit<
  MCPServerType,
  "tools" | "sId" | "availability" | "allowMultipleInstances"
>;

export type InternalMCPServerFlavorType = {
  id: string;
  name: string;
  description: string;
  icon: string;
};

type InternalMCPServerType = MCPServerType & {
  name: InternalMCPServerNameType;
  // We enforce that we pass an icon here.
  icon: InternalAllowedIconType;
  // Instructions that are appended to the overall prompt.
  instructions: string | null;

  flavors?: InternalMCPServerFlavorType[] | undefined;
};

export type InternalMCPServerDefinitionType = Omit<
  InternalMCPServerType,
  "tools" | "sId" | "availability" | "allowMultipleInstances"
>;

export type MCPServerTypeWithViews = MCPServerType & {
  views: MCPServerViewType[];
};
