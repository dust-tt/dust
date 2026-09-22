import type { AgentBuilderTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useAgentBuilderFormHydration } from "@app/components/agent_builder/hooks/useAgentBuilderFormHydration";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { GetSlackChannelsLinkedWithAgentResponseBody } from "@app/types/api/assistant/builder/slack/channels_linked_with_agent";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { UserType } from "@app/types/user";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => {
  const store: {
    actions: {
      id: string;
      configuration: {
        additionalConfiguration: Record<string, string>;
        dataSourceConfigurations: Record<
          string,
          { dataSourceView: { spaceId: string } }
        >;
      };
    }[];
    skills: { requestedSpaceIds: string[] }[];
    triggers: AgentBuilderTriggerType[];
    editors: UserType[];
    slackChannels: GetSlackChannelsLinkedWithAgentResponseBody["slackChannels"];
  } = {
    actions: [],
    skills: [],
    triggers: [],
    editors: [],
    slackChannels: [],
  };
  return { store };
});

const owner = LightWorkspaceFactory.build({ sId: "w_1" });

function makeUser(sId: string, id: number): UserType {
  return {
    sId,
    id,
    createdAt: 0,
    provider: "google",
    username: sId,
    email: `${sId}@dust.tt`,
    firstName: "Test",
    lastName: "User",
    fullName: "Test User",
    image: null,
    lastLoginAt: null,
  };
}

const currentUser = makeUser("user_1", 11);
const otherUser = makeUser("user_2", 22);

vi.mock("@app/components/agent_builder/AgentBuilderContext", () => ({
  useAgentBuilderContext: () => ({ owner, user: currentUser }),
}));

vi.mock("@app/components/agent_builder/DataSourceViewsContext", () => ({
  useDataSourceViewsContext: () => ({ supportedDataSourceViews: [] }),
}));

vi.mock("@app/components/shared/tools_picker/MCPServerViewsContext", () => ({
  useMCPServerViewsContext: () => ({ mcpServerViews: [] }),
}));

vi.mock("@app/components/agent_builder/SpacesContext", () => ({
  useSpacesContext: () => ({
    spaces: [{ sId: "space_global", kind: "global" }],
  }),
}));

vi.mock("@app/lib/swr/actions", () => ({
  useAgentConfigurationActions: () => ({
    actions: store.actions,
    mutateActions: vi.fn(),
  }),
}));

vi.mock("@app/lib/swr/agent_triggers", () => ({
  useAgentTriggers: () => ({
    triggers: store.triggers,
    mutateTriggers: vi.fn(),
  }),
}));

vi.mock("@app/lib/swr/skills", () => ({
  useAgentConfigurationSkills: () => ({
    skills: store.skills,
    mutateSkills: vi.fn(),
  }),
}));

vi.mock("@app/lib/swr/agent_editors", () => ({
  useEditors: () => ({ editors: store.editors, mutateEditors: vi.fn() }),
}));

vi.mock("@app/lib/swr/assistants", () => ({
  useSlackChannelsLinkedWithAgent: () => ({
    slackChannels: store.slackChannels,
  }),
}));

vi.mock("@app/lib/swr/permissions", () => ({
  useWorkspacePermissions: () => ({ hasPermission: () => true }),
}));

function makeAgentConfiguration(
  requestedSpaceIds: string[] = []
): AgentConfigurationType {
  return {
    id: 1,
    agentModelId: 1,
    versionCreatedAt: null,
    sId: "agent_1",
    version: 1,
    versionAuthorId: null,
    instructions: "Do the thing",
    instructionsHtml: null,
    model: { providerId: "openai", modelId: "gpt-4o", temperature: 0.7 },
    status: "active",
    scope: "visible",
    userFavorite: false,
    name: "Agent",
    description: "An agent",
    pictureUrl: "https://example.com/avatar.png",
    maxStepsPerRun: 8,
    tags: [],
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds,
    canRead: true,
    canEdit: true,
    actions: [],
  };
}

function makeTrigger(
  sId: string,
  editor: number | null
): AgentBuilderTriggerType {
  return {
    sId,
    status: "enabled",
    name: `Trigger ${sId}`,
    kind: "schedule",
    customPrompt: null,
    naturalLanguageDescription: null,
    configuration: { cron: "0 9 * * *", timezone: "UTC" },
    editor,
    executionMode: "user_pool",
  };
}

function renderHydration(
  input: Parameters<typeof useAgentBuilderFormHydration>[0] = {}
) {
  return renderHook(() => useAgentBuilderFormHydration(input));
}

describe("useAgentBuilderFormHydration", () => {
  beforeEach(() => {
    store.actions = [];
    store.skills = [];
    store.triggers = [];
    store.editors = [];
    store.slackChannels = [];
  });

  it("sets editors to the current user for a new agent when useEditors returns nothing", () => {
    const { result } = renderHydration();

    expect(result.current.hydratedValues.editors).toEqual([currentUser]);
  });

  it("sets editors from useEditors for an existing agent", () => {
    store.editors = [otherUser];

    const { result } = renderHydration({
      agentConfiguration: makeAgentConfiguration(),
    });

    expect(result.current.hydratedValues.editors).toEqual([otherUser]);
  });

  it("seeds triggersToUpdate with the current user's triggers and leaves triggersToCreate empty for an existing agent", () => {
    const ownTrigger = makeTrigger("trigger_own", currentUser.id);
    store.triggers = [ownTrigger, makeTrigger("trigger_other", otherUser.id)];

    const { result } = renderHydration({
      agentConfiguration: makeAgentConfiguration(),
    });

    expect(result.current.hydratedValues.triggersToUpdate).toEqual([
      ownTrigger,
    ]);
    expect(result.current.hydratedValues.triggersToCreate).toEqual([]);
  });

  it("seeds triggersToCreate with the current user's triggers and resets editors to the current user for a duplicate", () => {
    const ownTrigger = makeTrigger("trigger_own", currentUser.id);
    store.triggers = [ownTrigger, makeTrigger("trigger_other", otherUser.id)];
    store.editors = [otherUser];

    const { result } = renderHydration({
      agentConfiguration: makeAgentConfiguration(),
      duplicateAgentId: "agent_1",
    });

    expect(result.current.hydratedValues.triggersToCreate).toEqual([
      ownTrigger,
    ]);
    expect(result.current.hydratedValues.triggersToUpdate).toEqual([]);
    expect(result.current.hydratedValues.editors).toEqual([currentUser]);
  });

  it("sets additionalSpaces to the agent's requested spaces minus action, skill and global spaces, de-duplicated", () => {
    store.actions = [
      {
        id: "action_1",
        configuration: {
          additionalConfiguration: {},
          dataSourceConfigurations: {
            source: { dataSourceView: { spaceId: "space_action" } },
          },
        },
      },
    ];
    store.skills = [{ requestedSpaceIds: ["space_skill"] }];

    const { result } = renderHydration({
      agentConfiguration: makeAgentConfiguration([
        "space_dup",
        "space_dup",
        "space_action",
        "space_skill",
        "space_global",
        "space_other",
      ]),
    });

    expect(result.current.hydratedValues.additionalSpaces).toEqual([
      "space_dup",
      "space_other",
    ]);
  });

  it("keeps only the slack channels linked to this agent", () => {
    store.slackChannels = [
      {
        agentConfigurationId: "agent_1",
        slackChannelId: "C_1",
        slackChannelName: "#linked",
        autoRespondWithoutMention: true,
        autoRespondWithoutMentionSkipThreadReplies: false,
        isPrivate: false,
      },
      {
        agentConfigurationId: "agent_2",
        slackChannelId: "C_2",
        slackChannelName: "#other-agent",
        autoRespondWithoutMention: false,
        autoRespondWithoutMentionSkipThreadReplies: false,
        isPrivate: true,
      },
    ];

    const { result } = renderHydration({
      agentConfiguration: makeAgentConfiguration(),
    });

    expect(result.current.hydratedValues.slackChannels).toEqual([
      {
        slackChannelId: "C_1",
        slackChannelName: "#linked",
        autoRespondWithoutMention: true,
        autoRespondWithoutMentionSkipThreadReplies: false,
        isPrivate: false,
      },
    ]);
  });
});
