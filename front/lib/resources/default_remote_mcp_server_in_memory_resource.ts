import { DEFAULT_MCP_ACTION_VERSION } from "@app/lib/actions/constants";
import { remoteMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import {
  DEFAULT_REMOTE_MCP_SERVERS,
  getDefaultRemoteMCPServerById,
} from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { RemoteMCPServerType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isCreditPricedPlan } from "@app/types/plan";

export class DefaultRemoteMCPServerInMemoryResource {
  readonly id: string;
  private config: DefaultRemoteMCPServerConfig;

  constructor(id: string, config: DefaultRemoteMCPServerConfig) {
    this.id = id;
    this.config = config;
  }

  private static fetchById(
    auth: Authenticator,
    configId: number
  ): DefaultRemoteMCPServerInMemoryResource | null {
    const config = getDefaultRemoteMCPServerById(configId);
    if (!config) {
      return null;
    }

    const sId = remoteMCPServerNameToSId({
      remoteMCPServerId: config.id,
      workspaceId: auth.getNonNullableWorkspace().id,
    });

    return new this(sId, config);
  }

  /**
   * @cc [owner:smb2268,label:product] credit-priced-presets-hidden-from-other-plans
   * A preset with `creditPricedPlansOnly` MUST be omitted unless the workspace's plan is
   * credit-priced (`isCreditPricedPlan`), in addition to its `featureFlag` gate.
   */
  static async listAvailableDefaultRemoteMCPServers(
    auth: Authenticator
  ): Promise<DefaultRemoteMCPServerInMemoryResource[]> {
    const resources: DefaultRemoteMCPServerInMemoryResource[] = [];
    const featureFlags = await getFeatureFlags(auth);
    const isCreditPriced = isCreditPricedPlan(auth.getNonNullablePlan());

    for (const config of DEFAULT_REMOTE_MCP_SERVERS) {
      if (config.featureFlag && !featureFlags.includes(config.featureFlag)) {
        continue;
      }
      if (config.creditPricedPlansOnly && !isCreditPriced) {
        continue;
      }

      const resource = this.fetchById(auth, config.id);
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
              provider: "mcp" as const,
              supported_use_cases: this.config.supportedOAuthUseCases ?? [],
              scope: this.config.scope,
            }
          : this.config.authMethod === "oauth-static"
            ? {
                provider: "mcp_static" as const,
                supported_use_cases: this.config.supportedOAuthUseCases ?? [],
              }
            : null,
      tools: [], // There are no predefined tools for default remote servers
      documentationUrl: this.config.documentationUrl || null,
      availability: "manual" as const,
      allowMultipleInstances: true,
    };
  }
}
