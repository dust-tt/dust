import { DEFAULT_MCP_ACTION_VERSION } from "@app/lib/actions/constants";
import { remoteMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import {
  DEFAULT_REMOTE_MCP_SERVERS,
  getDefaultRemoteMCPServerById,
} from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { RemoteMCPServerType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";

export class DefaultRemoteMCPServerInMemoryResource {
  readonly id: string;
  private config: DefaultRemoteMCPServerConfig;

  constructor(id: string, config: DefaultRemoteMCPServerConfig) {
    this.id = id;
    this.config = config;
  }

  private static async init(
    auth: Authenticator,
    configId: number
  ): Promise<DefaultRemoteMCPServerInMemoryResource | null> {
    const config = getDefaultRemoteMCPServerById(configId);
    if (!config) {
      return null;
    }

    const sId = remoteMCPServerNameToSId({
      remoteMCPServerId: config.id,
      workspaceId: auth.getNonNullableWorkspace().id,
    });

    return new DefaultRemoteMCPServerInMemoryResource(sId, config);
  }

  static async listAvailableDefaultRemoteMCPServers(
    auth: Authenticator
  ): Promise<DefaultRemoteMCPServerInMemoryResource[]> {
    const resources: DefaultRemoteMCPServerInMemoryResource[] = [];

    for (const config of DEFAULT_REMOTE_MCP_SERVERS) {
      const resource = await DefaultRemoteMCPServerInMemoryResource.init(
        auth,
        config.id
      );
      if (resource) {
        resources.push(resource);
      }
    }

    return resources;
  }

  toJSON(): RemoteMCPServerType {
    return {
      sId: this.id,
      name: this.config.name,
      version: DEFAULT_MCP_ACTION_VERSION,
      description: this.config.description,
      icon: this.config.icon,
      authorization:
        this.config.authMethod === "oauth-dynamic"
          ? {
              provider: "mcp",
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              supported_use_cases: this.config.supportedOAuthUseCases || [],
              scope: this.config.scope,
            }
          : null,
      tools: [], // There are no predefined tools for default remote servers
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      documentationUrl: this.config.documentationUrl || null,
      availability: "manual" as const,
      allowMultipleInstances: true,
    };
  }
}
