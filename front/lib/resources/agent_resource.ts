import { globalAgentReaderRoles } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import type { Authenticator } from "@app/lib/auth";
import type { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import type { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { GrantVerb } from "@app/types/group_permissions";
import type {
  AccessControlList,
  RoleGrant,
  WithAccessControl,
} from "@app/types/resource_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";

// Legacy `canEdit` also allows changing the editor set, so the author fallback mirrors the full
// editor role rather than granting write alone.
const AGENT_EDITOR_VERBS: GrantVerb[] = ["read", "write", "admin"];

const HIDDEN_AGENT_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: AGENT_EDITOR_VERBS },
];

const VISIBLE_AGENT_ROLE_GRANTS: RoleGrant[] = [
  ...HIDDEN_AGENT_ROLE_GRANTS,
  { role: "manager", permissions: ["read"] },
  { role: "builder", permissions: ["read"] },
  { role: "user", permissions: ["read"] },
  { role: "none", permissions: ["read"] },
];

type CustomAgentAccess = {
  kind: "custom";
  agentModelId: ModelId;
  authorModelId: ModelId;
  scope: Exclude<AgentConfigurationScope, "global">;
};

type GlobalAgentAccess = {
  kind: "global";
  agentId: GLOBAL_AGENTS_SID;
};

type AgentAccess = CustomAgentAccess | GlobalAgentAccess;

type AgentConfigurationAccess = Pick<
  AgentConfigurationModel,
  "agentId" | "authorId" | "sId" | "scope" | "workspaceId"
>;

export class AgentResource implements WithAccessControl {
  private constructor(
    readonly id: ModelId | null,
    readonly sId: string,
    readonly workspaceId: ModelId,
    private readonly access: AgentAccess
  ) {}

  static fromAgentConfiguration(
    configuration: AgentConfigurationAccess
  ): AgentResource {
    return new AgentResource(
      configuration.agentId,
      configuration.sId,
      configuration.workspaceId,
      {
        kind: "custom",
        agentModelId: configuration.agentId,
        authorModelId: configuration.authorId,
        scope: configuration.scope,
      }
    );
  }

  static fromGlobalAgent({
    agentId,
    workspaceModelId,
  }: {
    agentId: GLOBAL_AGENTS_SID;
    workspaceModelId: ModelId;
  }): AgentResource {
    return new AgentResource(null, agentId, workspaceModelId, {
      kind: "global",
      agentId,
    });
  }

  getAccessControlLists(auth: Authenticator): AccessControlList[] {
    switch (this.access.kind) {
      case "custom": {
        const grants = auth.getGrantedVerbs("agent", this.access.agentModelId);
        const isAuthor =
          auth.workspace()?.id === this.workspaceId &&
          auth.user()?.id === this.access.authorModelId;

        return [
          {
            roles:
              this.access.scope === "visible"
                ? VISIBLE_AGENT_ROLE_GRANTS
                : HIDDEN_AGENT_ROLE_GRANTS,
            grantedVerbs: isAuthor
              ? [...new Set([...grants, ...AGENT_EDITOR_VERBS])]
              : grants,
            workspaceId: this.workspaceId,
          },
        ];
      }
      case "global":
        return [
          {
            roles: globalAgentReaderRoles(this.access.agentId).map((role) => ({
              role,
              permissions: ["read"],
            })),
            workspaceId: this.workspaceId,
          },
        ];
      default:
        return assertNever(this.access);
    }
  }

  canRead(auth: Authenticator): boolean {
    return auth.hasPermission("read", this);
  }

  canWrite(auth: Authenticator): boolean {
    return auth.hasPermission("write", this);
  }

  canAdministrate(auth: Authenticator): boolean {
    return auth.hasPermission("admin", this);
  }
}
