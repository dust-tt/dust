import {
  isAuthorizedForAgentSuggestionKind,
  isAuthorizedToApplyAgentSuggestions,
} from "@app/lib/api/assistant/agent_suggestion_authorization";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { WorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

async function authFor(
  workspace: WorkspaceType,
  role: "user" | "admin"
): Promise<Authenticator> {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role });
  return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
}

async function fetchAgent(auth: Authenticator, agentId: string) {
  const agent = await AgentResource.fetchById(auth, agentId);
  if (!agent) {
    throw new Error("Agent not found.");
  }
  return agent;
}

describe("agent suggestion authorization", () => {
  it("authorizes an editor holding the workspace capabilities for every kind", async () => {
    const { user, workspace } = await createResourceTest({ role: "user" });
    await GroupPermissionResource.setForEverybody(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      { grantType: "create", resourceType: "agent" }
    );
    await GroupPermissionResource.setForEverybody(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      { grantType: "publish", resourceType: "agent" }
    );
    const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const agent = await fetchAgent(authenticator, agentConfiguration.sId);

    expect(
      isAuthorizedToApplyAgentSuggestions(authenticator, agent, [
        { kind: "create" },
        { kind: "name" },
        { kind: "instructions" },
        { kind: "model" },
        { kind: "scope" },
        { kind: "delete" },
      ])
    ).toBe(true);
  });

  it("refuses an editor `create` and `scope` without the matching workspace capability", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });
    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const agent = await fetchAgent(authenticator, agentConfiguration.sId);

    expect(
      isAuthorizedForAgentSuggestionKind(authenticator, agent, "create")
    ).toBe(false);
    expect(
      isAuthorizedForAgentSuggestionKind(authenticator, agent, "scope")
    ).toBe(false);
    expect(
      isAuthorizedForAgentSuggestionKind(authenticator, agent, "name")
    ).toBe(true);
  });

  it("authorizes a non-editor workspace admin only for the kinds `admin` allows", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "user",
    });
    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { scope: "visible" }
    );
    const adminAuth = await authFor(workspace, "admin");
    const agent = await fetchAgent(adminAuth, agentConfiguration.sId);

    expect(isAuthorizedForAgentSuggestionKind(adminAuth, agent, "model")).toBe(
      true
    );
    expect(isAuthorizedForAgentSuggestionKind(adminAuth, agent, "delete")).toBe(
      true
    );
    expect(isAuthorizedForAgentSuggestionKind(adminAuth, agent, "name")).toBe(
      false
    );
    // One kind the caller cannot apply is enough to refuse the whole set.
    expect(
      isAuthorizedToApplyAgentSuggestions(adminAuth, agent, [
        { kind: "model" },
        { kind: "name" },
      ])
    ).toBe(false);
  });

  it("refuses a member who is not an editor", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "user",
    });
    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { scope: "visible" }
    );
    const memberAuth = await authFor(workspace, "user");
    const agent = await fetchAgent(memberAuth, agentConfiguration.sId);

    expect(
      isAuthorizedToApplyAgentSuggestions(memberAuth, agent, [
        { kind: "description" },
      ])
    ).toBe(false);
  });
});
