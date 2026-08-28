import type * as workosAudit from "@app/lib/api/audit/workos_audit";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return {
    ...actual,
    emitAuditLogEvent: vi.fn(),
  };
});

import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import {
  allowSlackWorkflow,
  listSlackWorkflows,
} from "@app/lib/api/slack/summoning_whitelist";
import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  connectSlackBot,
  mockAllowSlackWorkflow,
  mockSummoningWhitelist,
  SLACK_WORKFLOW_BOT_NAME,
} from "@app/tests/utils/slack_workflows";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

async function setupTest() {
  const workspace = await WorkspaceFactory.basic();
  const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const { systemSpace } = await SpaceResource.makeDefaultsForWorkspace(auth, {
    globalGroup,
    systemGroup,
  });
  await connectSlackBot(workspace, systemSpace);

  const space = await SpaceFactory.regular(workspace);
  const memberGroup = await space.fetchManualMemberGroup(auth);

  return { auth, workspace, globalGroup, space, memberGroup };
}

// A provisioned group can be attached to several spaces at once, so whichever groups the whitelist
// stores have to be the space's own member group — see `listSpaceMemberGroups`.
async function attachProvisionedGroup(
  auth: Authenticator,
  space: SpaceResource,
  group?: GroupResource
) {
  const provisionedGroup =
    group ??
    (await GroupResource.makeNew({
      name: "Provisioned Group",
      workspaceId: auth.getNonNullableWorkspace().id,
      kind: "provisioned",
    }));

  const updateRes = await space.updatePermissions(auth, {
    name: space.name,
    isRestricted: true,
    managementMode: "group",
    groupIds: [provisionedGroup.sId],
    editorGroupIds: [],
  });
  expect(updateRes.isOk()).toBe(true);

  return provisionedGroup;
}

describe("allowSlackWorkflow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("whitelists the space's own member group and the global group", async () => {
    const { auth, globalGroup, space, memberGroup } = await setupTest();
    const allow = mockAllowSlackWorkflow();

    const result = await allowSlackWorkflow(auth, {
      botName: SLACK_WORKFLOW_BOT_NAME,
      spaceIds: [space.sId],
    });

    expect(result.isOk()).toBe(true);
    expect(allow).toHaveBeenCalledWith(
      expect.objectContaining({
        botName: SLACK_WORKFLOW_BOT_NAME,
        groupIds: [globalGroup.sId, memberGroup.sId],
      })
    );
  });

  it("leaves out the groups the space shares with other spaces", async () => {
    const { auth, globalGroup, space, memberGroup } = await setupTest();
    const provisionedGroup = await attachProvisionedGroup(auth, space);
    const allow = mockAllowSlackWorkflow();

    const result = await allowSlackWorkflow(auth, {
      botName: SLACK_WORKFLOW_BOT_NAME,
      spaceIds: [space.sId],
    });

    expect(result.isOk()).toBe(true);
    expect(allow).toHaveBeenCalledWith(
      expect.objectContaining({
        groupIds: [globalGroup.sId, memberGroup.sId],
      })
    );
    expect(allow.mock.calls[0][0].groupIds).not.toContain(provisionedGroup.sId);
  });

  it("rejects a space the workspace does not have", async () => {
    const { auth, space } = await setupTest();
    const otherWorkspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(otherWorkspace);
    const otherSpace = await SpaceFactory.regular(otherWorkspace);
    const allow = mockAllowSlackWorkflow();

    const result = await allowSlackWorkflow(auth, {
      botName: SLACK_WORKFLOW_BOT_NAME,
      spaceIds: [space.sId, otherSpace.sId],
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.type).toBe("invalid_spaces");
    expect(allow).not.toHaveBeenCalled();
  });
});

describe("listSlackWorkflows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves a stored member group back to its space", async () => {
    const { auth, globalGroup, space, memberGroup } = await setupTest();
    mockSummoningWhitelist([
      {
        botName: SLACK_WORKFLOW_BOT_NAME,
        groupIds: [globalGroup.sId, memberGroup.sId],
      },
    ]);

    const result = await listSlackWorkflows(auth);

    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.workflows).toEqual([
      expect.objectContaining({
        botName: SLACK_WORKFLOW_BOT_NAME,
        spaces: [{ sId: space.sId, name: space.name }],
      }),
    ]);
  });

  it("ignores stored groups that are not a space's member group", async () => {
    const { auth, space } = await setupTest();
    const provisionedGroup = await attachProvisionedGroup(auth, space);
    mockSummoningWhitelist([
      {
        botName: SLACK_WORKFLOW_BOT_NAME,
        groupIds: [provisionedGroup.sId],
      },
    ]);

    const result = await listSlackWorkflows(auth);

    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.workflows).toEqual([
      expect.objectContaining({ spaces: [] }),
    ]);
  });
});

const REACH_AGENT_PREFIX = "reach-";
const SPACE_AGENT_NAME = `${REACH_AGENT_PREFIX}space`;
const OTHER_SPACE_AGENT_NAME = `${REACH_AGENT_PREFIX}other-space`;

async function setupReachTest() {
  const workspace = await WorkspaceFactory.basic();
  const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  await SpaceResource.makeDefaultsForWorkspace(auth, {
    globalGroup,
    systemGroup,
  });

  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });
  const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const space = await SpaceFactory.regular(workspace);
  const memberGroup = await space.fetchManualMemberGroup(auth);
  await AgentConfigurationFactory.createTestAgent(userAuth, {
    name: SPACE_AGENT_NAME,
    requestedSpaceIds: [space.id],
  });

  const systemKey = await KeyFactory.system(systemGroup);

  // Connectors sends the whitelist's group ids in `X-Dust-Group-Ids`, which `Authenticator.fromKey`
  // substitutes for the system key's own groups. Summoning then goes through the regular space
  // permission checks, so what the workflow can call is exactly what those groups grant.
  const summonableAgentNames = async (groupIds: string[]) => {
    const { workspaceAuth } = await Authenticator.fromKey(
      systemKey,
      workspace.sId,
      groupIds
    );
    const agents = await getAgentConfigurationsForView({
      auth: workspaceAuth,
      agentsGetView: "all",
      variant: "light",
    });

    return agents
      .map((agent) => agent.name)
      .filter((name) => name.startsWith(REACH_AGENT_PREFIX))
      .sort();
  };

  return {
    auth,
    userAuth,
    workspace,
    globalGroup,
    space,
    memberGroup,
    summonableAgentNames,
  };
}

describe("slack workflow reach", () => {
  it("makes a space's agents summonable through its member group only", async () => {
    const { globalGroup, memberGroup, summonableAgentNames } =
      await setupReachTest();

    expect(
      await summonableAgentNames([globalGroup.sId, memberGroup.sId])
    ).toEqual([SPACE_AGENT_NAME]);
    expect(await summonableAgentNames([globalGroup.sId])).toEqual([]);
  });

  it("keeps a space's reach when its access moves to provisioned groups", async () => {
    const {
      auth,
      userAuth,
      workspace,
      globalGroup,
      space,
      memberGroup,
      summonableAgentNames,
    } = await setupReachTest();
    const provisionedGroup = await attachProvisionedGroup(auth, space);

    expect(
      await summonableAgentNames([globalGroup.sId, memberGroup.sId])
    ).toEqual([SPACE_AGENT_NAME]);

    const otherSpace = await SpaceFactory.regular(workspace);
    await AgentConfigurationFactory.createTestAgent(userAuth, {
      name: OTHER_SPACE_AGENT_NAME,
      requestedSpaceIds: [otherSpace.id],
    });
    await attachProvisionedGroup(auth, otherSpace, provisionedGroup);

    expect(
      await summonableAgentNames([globalGroup.sId, memberGroup.sId])
    ).toEqual([SPACE_AGENT_NAME]);
    expect(
      await summonableAgentNames([globalGroup.sId, provisionedGroup.sId])
    ).toEqual([OTHER_SPACE_AGENT_NAME, SPACE_AGENT_NAME]);
  });
});
