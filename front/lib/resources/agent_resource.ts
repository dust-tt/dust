import { globalAgentReaderRoles } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  AgentConfigurationScope,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { GrantVerb } from "@app/types/group_permissions";
import { grantKey } from "@app/types/group_permissions";
import type {
  RoleGrant,
  WithAccessControl,
} from "@app/types/resource_permissions";
import { verbsFromRoleGrants } from "@app/types/resource_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";
import assert from "assert";
import type { Transaction } from "sequelize";

// Legacy `canEdit` also allows changing the editor set, so the author fallback mirrors the full
// editor role rather than granting write alone.
const AGENT_EDITOR_VERBS: GrantVerb[] = ["read", "write", "admin", "use"];

// Human workspace admins manage editors but must grant themselves editor access to change the agent.
// Admins do not receive `use` on hidden agents: a hidden agent is usable only by its editors, not by
// virtue of the workspace admin role.
const HIDDEN_AGENT_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: ["admin"] },
];

// Visible agents are readable by every workspace role and usable by every active role, including
// admins (who additionally keep the hidden-grant `admin` verb). The `none` role — a revoked /
// non-member caller — can read but not use.
const VISIBLE_AGENT_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: ["read", "admin", "use"] },
  { role: "manager", permissions: ["read", "use"] },
  { role: "builder", permissions: ["read", "use"] },
  { role: "user", permissions: ["read", "use"] },
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

  /**
   * Builds the identity resource for a custom agent from an already-loaded configuration.
   * Pure: the stable `agentModelId` travels on the configuration, so no query is needed. The
   * workspace comes from `auth` (a configuration always belongs to the authed workspace).
   */
  static fromAgentConfiguration(
    auth: Authenticator,
    configuration: Pick<
      LightAgentConfigurationType,
      "agentModelId" | "sId" | "scope" | "versionAuthorId"
    >
  ): AgentResource {
    assert(configuration.scope !== "global");
    assert(
      configuration.agentModelId !== null,
      "Unexpected: custom agent identity is missing"
    );
    assert(
      configuration.versionAuthorId !== null,
      "Unexpected: custom agent author is missing"
    );

    return new AgentResource(
      configuration.agentModelId,
      configuration.sId,
      auth.getNonNullableWorkspace().id,
      "custom",
      configuration.versionAuthorId,
      configuration.scope
    );
  }

  static fromAgentConfigurations(
    auth: Authenticator,
    configurations: Pick<
      LightAgentConfigurationType,
      "agentModelId" | "sId" | "scope" | "versionAuthorId"
    >[]
  ): AgentResource[] {
    return configurations.map((configuration) =>
      this.fromAgentConfiguration(auth, configuration)
    );
  }

  async listEditors(auth: Authenticator): Promise<UserResource[] | null> {
    const editorsByAgentId = await AgentResource.batchListEditors(auth, [this]);
    const editors = editorsByAgentId.get(this.sId);
    assert(editors !== undefined);

    return editors;
  }

  /**
   * @cc [owner:philipperolet,label:backend] editor-results-by-agent
   * Each input agent has a map entry: `null` for globals and active workspace members
   * of its editor grant for custom agents, or `[]` when there are none.
   */
  static async batchListEditors(
    auth: Authenticator,
    agents: AgentResource[]
  ): Promise<Map<string, UserResource[] | null>> {
    const result = new Map<string, UserResource[] | null>(
      agents.map((agent) => [agent.sId, null])
    );
    const customAgents = agents.filter((agent) => agent.id !== null);
    if (customAgents.length === 0) {
      return result;
    }

    const editorGrant = (agent: AgentResource) => {
      assert(agent.id !== null);
      return {
        grantType: "editor" as const,
        resourceType: "agent" as const,
        resourceId: agent.id,
      };
    };
    const groupByGrant =
      await GroupPermissionResource.findRegularAutoGroupsForGrants(auth, {
        grants: customAgents.map(editorGrant),
      });
    const groupByAgentModelId = new Map<ModelId, GroupResource>(
      removeNulls(
        customAgents.map((agent) => {
          assert(agent.id !== null);
          const group = groupByGrant.get(grantKey(editorGrant(agent)));
          return group ? ([agent.id, group] as const) : null;
        })
      )
    );
    const membershipsByGroupId =
      await GroupResource.getActiveMembershipsForGroups(auth, [
        ...groupByAgentModelId.values(),
      ]);
    const userModelIds = [
      ...new Set(Object.values(membershipsByGroupId).flat()),
    ];
    const users = await UserResource.fetchByModelIds(userModelIds);
    const { memberships } = await MembershipResource.getActiveMemberships({
      users,
      workspace: auth.getNonNullableWorkspace(),
    });
    const activeUserModelIds = new Set(
      memberships.map((membership) => membership.userId)
    );
    const userByModelId = new Map(
      users
        .filter((user) => activeUserModelIds.has(user.id))
        .map((user) => [user.id, user])
    );

    for (const agent of customAgents) {
      assert(agent.id !== null);
      const group = groupByAgentModelId.get(agent.id);
      const memberModelIds = group
        ? (membershipsByGroupId[group.id] ?? [])
        : [];
      result.set(
        agent.sId,
        removeNulls(
          memberModelIds.map((userModelId) => userByModelId.get(userModelId))
        )
      );
    }

    return result;
  }

  static async listEditorConfigModelIds(
    auth: Authenticator
  ): Promise<ModelId[]> {
    const resources = auth.getResourceIdsWithVerb("agent", "write");
    const where =
      resources.kind === "all" ? {} : { agentId: resources.resourceIds };
    // agentId is indexed for the normal per-user path; workspaceId indexes the rare type-wide path.
    const configurations = await AgentConfigurationModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      attributes: ["id"],
    });

    return configurations.map((configuration) => configuration.id);
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

  /**
   * Deletes the agent's permission rows and their regular_auto groups.
   * Only call after deleting the last configuration of the logical agent.
   */
  async destroyPermissionsAndGroups(
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

  /**
   * @cc [owner:philipperolet,label:security] admin-key-agent-write
   * The admin role grants `write` on custom agents to regular API keys only; human and system-key
   * callers receive no agent write access from their role. Global agents remain read-only.
   */
  /**
   * @cc [owner:philipperolet,label:security] hidden-agent-content
   * Admin role alone must not grant `read` on hidden agents, including for regular API keys
   * with role-based write access. Agent details may separately override admin redaction.
   */
  getAllowedVerbs(auth: Authenticator): Set<GrantVerb> {
    switch (this.kind) {
      case "global": {
        assert(isGlobalAgentId(this.sId));

        const roleGrants: RoleGrant[] = globalAgentReaderRoles(this.sId).map(
          (role) => ({ role, permissions: ["read"] })
        );
        return new Set(verbsFromRoleGrants(auth, roleGrants, this.workspaceId));
      }
      case "custom": {
        assert(this.id !== null);
        assert(this.authorId !== null);

        const grants = auth.getGovernanceGrantVerbs(
          "agent",
          this.id,
          this.workspaceId
        );
        const isAuthor =
          auth.workspace()?.id === this.workspaceId &&
          auth.user()?.id === this.authorId;
        const roles =
          this.scope === "visible"
            ? VISIBLE_AGENT_ROLE_GRANTS
            : HIDDEN_AGENT_ROLE_GRANTS;
        const roleGrants: RoleGrant[] =
          auth.isKey() && !auth.isSystemKey()
            ? [...roles, { role: "admin", permissions: ["write"] }]
            : roles;

        return new Set([
          ...(isAuthor ? [...grants, ...AGENT_EDITOR_VERBS] : grants),
          ...verbsFromRoleGrants(auth, roleGrants, this.workspaceId),
        ]);
      }
      default:
        return assertNever(this.kind);
    }
  }
}
