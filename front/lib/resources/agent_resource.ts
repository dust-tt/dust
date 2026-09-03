import { globalAgentReaderRoles } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import type { Authenticator } from "@app/lib/auth";
import type { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentModel } from "@app/lib/models/agent/agent";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type {
  AgentConfigurationScope,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { GrantVerb } from "@app/types/group_permissions";
import type {
  AccessControlList,
  RoleGrant,
  WithAccessControl,
} from "@app/types/resource_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { UserType } from "@app/types/user";
import assert from "assert";
import type { Transaction } from "sequelize";

// Legacy `canEdit` also allows changing the editor set, so the author fallback mirrors the full
// editor role rather than granting write alone.
const AGENT_EDITOR_VERBS: GrantVerb[] = ["read", "write", "admin"];

// Workspace admins manage editors but must grant themselves editor access to change the agent.
const HIDDEN_AGENT_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: ["read", "admin"] },
];

const VISIBLE_AGENT_ROLE_GRANTS: RoleGrant[] = [
  ...HIDDEN_AGENT_ROLE_GRANTS,
  { role: "manager", permissions: ["read"] },
  { role: "builder", permissions: ["read"] },
  { role: "user", permissions: ["read"] },
  { role: "none", permissions: ["read"] },
];

export class AgentResource implements WithAccessControl {
  private constructor(
    readonly id: ModelId | null,
    readonly sId: string,
    readonly workspaceId: ModelId,
    readonly kind: "custom" | "global",
    private readonly authorId: ModelId | null,
    private readonly scope: AgentConfigurationScope
  ) {}

  static fromAgentConfigurationModel(
    configuration: Pick<
      AgentConfigurationModel,
      "agentId" | "authorId" | "sId" | "scope" | "workspaceId"
    >
  ): AgentResource {
    return new AgentResource(
      configuration.agentId,
      configuration.sId,
      configuration.workspaceId,
      "custom",
      configuration.authorId,
      configuration.scope
    );
  }

  static fromGlobalAgent({
    agentId,
    workspaceModelId,
  }: {
    agentId: GLOBAL_AGENTS_SID;
    workspaceModelId: ModelId;
  }): AgentResource {
    return new AgentResource(
      null,
      agentId,
      workspaceModelId,
      "global",
      null,
      "global"
    );
  }

  static async fetchByAgentConfiguration(
    auth: Authenticator,
    configuration: Pick<
      LightAgentConfigurationType,
      "sId" | "scope" | "versionAuthorId"
    >,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<AgentResource> {
    assert(configuration.scope !== "global");
    assert(
      configuration.versionAuthorId !== null,
      "Unexpected: custom agent author is missing"
    );

    // agents.sId is unique, so this resolves one stable ID regardless of version count.
    const agent = await AgentModel.findOne({
      where: {
        sId: configuration.sId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      attributes: ["id", "workspaceId"],
      transaction,
    });
    assert(agent, "Unexpected: agent identity is missing");

    return this.fromAgentConfigurationModel({
      agentId: agent.id,
      authorId: configuration.versionAuthorId,
      sId: configuration.sId,
      scope: configuration.scope,
      workspaceId: agent.workspaceId,
    });
  }

  async grantEditors(
    auth: Authenticator,
    { editors, transaction }: { editors: UserType[]; transaction: Transaction }
  ): Promise<void> {
    assert(this.kind === "custom");
    assert(this.id !== null);
    assert(auth.getNonNullableWorkspace().id === this.workspaceId);

    const grantResult = await GroupPermissionResource.grantToUsers(auth, {
      users: editors,
      grantType: "editor",
      resourceType: "agent",
      resourceId: this.id,
      transaction,
    });
    if (grantResult.isErr()) {
      throw grantResult.error;
    }
  }

  async revokeEditors(
    auth: Authenticator,
    { editors, transaction }: { editors: UserType[]; transaction: Transaction }
  ): Promise<void> {
    assert(this.kind === "custom");
    assert(this.id !== null);
    assert(auth.getNonNullableWorkspace().id === this.workspaceId);

    const revokeResult = await GroupPermissionResource.revokeFromUsers(auth, {
      users: editors,
      grantType: "editor",
      resourceType: "agent",
      resourceId: this.id,
      transaction,
    });
    if (revokeResult.isErr()) {
      throw revokeResult.error;
    }
  }

  async deletePermissions(
    auth: Authenticator,
    { transaction }: { transaction: Transaction }
  ): Promise<void> {
    assert(this.kind === "custom");
    assert(this.id !== null);
    assert(auth.getNonNullableWorkspace().id === this.workspaceId);

    const grantGroups =
      await GroupPermissionResource.listRegularAutoGroupsForResource(auth, {
        resourceType: "agent",
        resourceId: this.id,
        transaction,
      });
    await GroupPermissionResource.deleteAllForResource(auth, {
      resourceType: "agent",
      resourceId: this.id,
      transaction,
    });

    for (const grantGroup of grantGroups) {
      const deleteResult = await grantGroup.delete(auth, { transaction });
      if (deleteResult.isErr()) {
        throw deleteResult.error;
      }
    }
  }

  getAccessControlLists(auth: Authenticator): AccessControlList[] {
    switch (this.kind) {
      case "global":
        assert(isGlobalAgentId(this.sId));

        return [
          {
            roles: globalAgentReaderRoles(this.sId).map((role) => ({
              role,
              permissions: ["read"],
            })),
            workspaceId: this.workspaceId,
          },
        ];
      case "custom": {
        assert(this.id !== null);
        assert(this.authorId !== null);

        const grants = auth.getGrantedVerbs("agent", this.id);
        const isAuthor =
          auth.workspace()?.id === this.workspaceId &&
          auth.user()?.id === this.authorId;

        return [
          {
            roles:
              this.scope === "visible"
                ? VISIBLE_AGENT_ROLE_GRANTS
                : HIDDEN_AGENT_ROLE_GRANTS,
            grantedVerbs: isAuthor
              ? [...new Set([...grants, ...AGENT_EDITOR_VERBS])]
              : grants,
            workspaceId: this.workspaceId,
          },
        ];
      }
      default:
        return assertNever(this.kind);
    }
  }
}
