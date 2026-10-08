import { SlackChatBotMessageModel } from "@connectors/lib/models/slack";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { DustAPI, Ok } from "@dust-tt/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const postEphemeral = vi.fn(async () => ({ ok: true }));

vi.mock(import("@connectors/lib/api/config"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    apiConfig: {
      ...original.apiConfig,
      getDustFrontAPIUrl: () => "https://dust.test",
    },
  };
});

vi.mock(
  "@connectors/connectors/slack/lib/slack_client",
  async (importOriginal) => ({
    ...(await importOriginal()),
    getSlackClient: vi.fn(async () => ({ chat: { postEphemeral } })),
    getSlackUserInfoMemoized: vi.fn(async () => ({ is_bot: false })),
  })
);

// The locale lookup goes through Redis, unavailable in these tests.
vi.mock(
  "@connectors/connectors/slack/lib/user_locale",
  async (importOriginal) => {
    const { getSlackI18n } =
      await import("@connectors/connectors/slack/lib/i18n");
    return {
      ...(await importOriginal()),
      getSlackI18nForUser: vi.fn(async () => getSlackI18n("en-US")),
    };
  }
);

const { notifyIfSlackUserIsNotAllowed } = vi.hoisted(() => ({
  notifyIfSlackUserIsNotAllowed: vi.fn(),
}));

vi.mock(
  "@connectors/connectors/slack/lib/workspace_limits",
  async (importOriginal) => ({
    ...(await importOriginal()),
    notifyIfSlackUserIsNotAllowed,
  })
);

import { botAnswerUserQuestion } from "./bot";

async function makeSlackConnector(slackTeamId: string) {
  return ConnectorResource.makeNew(
    "slack",
    {
      connectionId: `connection-${slackTeamId}`,
      dataSourceId: `data-source-${slackTeamId}`,
      workspaceAPIKey: "workspace-api-key",
      workspaceId: `workspace-${slackTeamId}`,
    },
    {
      autoReadChannelPatterns: [],
      botEnabled: true,
      feedbackVisibleToAuthorOnly: true,
      restrictedSpaceAgentsEnabled: true,
      slackTeamId,
    }
  );
}

async function makeSlackChatBotMessage(connector: ConnectorResource) {
  return SlackChatBotMessageModel.create({
    connectorId: connector.id,
    channelId: "C123",
    message: "hello",
    slackUserId: "U123",
    slackEmail: "user@example.com",
    slackUserName: "user",
    userType: "user",
  });
}

function sentExtraHeaders(): Record<string, string> | undefined {
  const [dustAPI] = vi.mocked(DustAPI.prototype.answerUserQuestion).mock
    .contexts;
  return dustAPI instanceof DustAPI
    ? dustAPI._credentials.extraHeaders
    : undefined;
}

function answerParams(slackTeamId: string, slackChatBotMessageId: number) {
  return {
    actionId: "action_1",
    answer: { selectedOptions: [0] },
    conversationId: "conv_1",
    messageId: "msg_1",
    slackChatBotMessageId,
    slackTeamId,
    slackChannel: "C123",
    slackThreadTs: "1700000000.000001",
    slackUserId: "U123",
    responseUrl: undefined,
  };
}

describe("botAnswerUserQuestion", () => {
  beforeEach(() => {
    vi.spyOn(DustAPI.prototype, "answerUserQuestion").mockResolvedValue(
      new Ok({ success: true })
    );
    notifyIfSlackUserIsNotAllowed.mockResolvedValue(
      new Ok({ authorized: true, groupIds: [] })
    );
  });

  it("answers using a message of the connector resolved from the team", async () => {
    const connector = await makeSlackConnector("T_OWN");
    const message = await makeSlackChatBotMessage(connector);

    const res = await botAnswerUserQuestion(answerParams("T_OWN", message.id));

    expect(res.isOk()).toBe(true);
    expect(DustAPI.prototype.answerUserQuestion).toHaveBeenCalledOnce();
  });

  it("rejects a message belonging to another connector", async () => {
    await makeSlackConnector("T_OWN");
    const otherConnector = await makeSlackConnector("T_OTHER");
    const otherMessage = await makeSlackChatBotMessage(otherConnector);

    const res = await botAnswerUserQuestion(
      answerParams("T_OWN", otherMessage.id)
    );

    expect(res.isErr()).toBe(true);
    expect(DustAPI.prototype.answerUserQuestion).not.toHaveBeenCalled();
    expect(postEphemeral).not.toHaveBeenCalled();
  });

  it("sends the whitelisted groups of an external user along with their email", async () => {
    notifyIfSlackUserIsNotAllowed.mockResolvedValue(
      new Ok({ authorized: true, groupIds: ["grp_guests"] })
    );
    const connector = await makeSlackConnector("T_OWN");
    const message = await makeSlackChatBotMessage(connector);

    const res = await botAnswerUserQuestion(answerParams("T_OWN", message.id));

    expect(res.isOk()).toBe(true);
    expect(sentExtraHeaders()).toEqual(
      expect.objectContaining({
        "X-Dust-Group-Ids": "grp_guests",
        "x-api-user-email": "user@example.com",
      })
    );
  });

  it("does not answer for a user who is not allowed", async () => {
    notifyIfSlackUserIsNotAllowed.mockResolvedValue(
      new Ok({ authorized: false, groupIds: [] })
    );
    const connector = await makeSlackConnector("T_OWN");
    const message = await makeSlackChatBotMessage(connector);

    const res = await botAnswerUserQuestion(answerParams("T_OWN", message.id));

    expect(res.isOk()).toBe(true);
    expect(res.isOk() && res.value).toBeUndefined();
    expect(DustAPI.prototype.answerUserQuestion).not.toHaveBeenCalled();
  });
});
