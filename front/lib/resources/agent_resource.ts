import { globalAgentReaderRoles } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
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
  AccessControlList,
  RoleGrant,
  WithAccessControl,
} from "@app/types/resource_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
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

  static async fetchByAgentConfigurations(
    auth: Authenticator,
    configurations: Pick<
      LightAgentConfigurationType,
      "sId" | "scope" | "versionAuthorId"
    >[]
  ): Promise<AgentResource[]> {
    if (configurations.length === 0) {
      return [];
    }

    // agents.sId is unique, so the batch lookup stays indexed and workspace-scoped.
    const agents = await AgentModel.findAll({
      where: {
        sId: configurations.map((configuration) => configuration.sId),
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      attributes: ["id", "sId", "workspaceId"],
    });
    const agentById = new Map(agents.map((agent) => [agent.sId, agent]));

    return configurations.map((configuration) => {
      assert(configuration.scope !== "global");
      assert(
        configuration.versionAuthorId !== null,
        "Unexpected: custom agent author is missing"
      );
      const agent = agentById.get(configuration.sId);
      assert(agent, "Unexpected: agent identity is missing");

      return new AgentResource(
        agent.id,
        agent.sId,
        agent.workspaceId,
        "custom",
        configuration.versionAuthorId,
        configuration.scope
      );
    });
  }

  async listEditors(auth: Authenticator): Promise<UserResource[] | null> {
    if (this.kind === "global") {
      return null;
    }
    assert(this.id !== null);

    const group = await GroupPermissionResource.findRegularAutoGroupForGrant(
      auth,
      {
        grantType: "editor",
        resourceType: "agent",
        resourceId: this.id,
      }
    );

    return group ? group.getActiveMembers(auth) : [];
  }

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
    if (userModelIds.length === 0) {
      for (const agent of customAgents) {
        result.set(agent.sId, []);
      }
      return result;
    }

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
