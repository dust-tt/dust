import { reconcilePostedAgentMessages } from "@app/components/assistant/conversation/reconcilePostedAgentMessages";
import type {
  AgentMessageWithStreaming,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import { makeInitialMessageStreamState } from "@app/components/assistant/conversation/types";
import type { LightAgentMessageType } from "@app/types/assistant/conversation";
import type { VirtuosoMessageListMethods } from "@virtuoso.dev/message-list";
import { describe, expect, it } from "vitest";

type MessageDataMethods = Pick<
  VirtuosoMessageListMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >["data"],
  "append" | "findAndDelete" | "get" | "insert" | "map"
>;

function makePostedMessage(
  sId: string,
  rank: number,
  configurationId = "agent_1"
): LightAgentMessageType {
  return {
    type: "agent_message",
    sId,
    version: 0,
    rank,
    branchId: null,
    created: 1,
    completedTs: null,
    parentMessageId: "user_1",
    parentAgentMessageId: null,
    status: "created",
    content: null,
    chainOfThought: null,
    error: null,
    visibility: "visible",
    richMentions: [],
    completionDurationMs: null,
    reactions: [],
    costCredits: null,
    configuration: {
      sId: configurationId,
      name: "Agent",
      pictureUrl: "",
      status: "active",
      canRead: true,
    },
    citations: {},
    generatedFiles: [],
    activitySteps: [],
    resolvedModel: null,
    modelResolutionMethod: null,
  };
}

function makePlaceholder(
  posted: LightAgentMessageType
): AgentMessageWithStreaming {
  const message = makeInitialMessageStreamState(posted);
  return {
    ...message,
    sId: "placeholder-agent-message-1",
    streaming: { ...message.streaming, agentState: "placeholder" },
  };
}

function makeData(initial: VirtuosoMessage[]) {
  let messages = initial;
  const data = {
    append: (items) => {
      messages = [...messages, ...items];
    },
    findAndDelete: (predicate) => {
      messages = messages.filter(
        (message, index) => !predicate(message, index)
      );
    },
    get: () => messages,
    insert: (items, offset) => {
      messages = [
        ...messages.slice(0, offset),
        ...items,
        ...messages.slice(offset),
      ];
    },
    map: (callback) => {
      messages = messages.map(callback);
    },
  } satisfies MessageDataMethods;
  return { data, getMessages: () => messages };
}

describe("reconcilePostedAgentMessages", () => {
  it("replaces an optimistic row with the real message returned by the POST", () => {
    const posted = makePostedMessage("message_1", 2);
    const placeholder = makePlaceholder(posted);
    const list = makeData([placeholder]);

    reconcilePostedAgentMessages(list.data, [placeholder], [posted]);

    expect(list.getMessages()).toMatchObject([
      {
        sId: "message_1",
        status: "created",
        streaming: { agentState: "thinking" },
      },
    ]);
  });

  it("preserves a real row that already received stream events", () => {
    const posted = makePostedMessage("message_1", 2);
    const placeholder = makePlaceholder(posted);
    const streamed = {
      ...makeInitialMessageStreamState(posted),
      content: "Already streamed",
    };
    const list = makeData([placeholder, streamed]);

    reconcilePostedAgentMessages(list.data, [placeholder], [posted]);

    expect(list.getMessages()).toEqual([streamed]);
  });

  it("pairs repeated agent mentions by rank and removes uncreated placeholders", () => {
    const first = makePostedMessage("message_1", 2);
    const second = makePostedMessage("message_2", 3);
    const firstPlaceholder = makePlaceholder(first);
    const secondPlaceholder = makePlaceholder(second);
    const uncreatedPlaceholder = makePlaceholder(
      makePostedMessage("message_3", 4, "agent_2")
    );
    const list = makeData([
      firstPlaceholder,
      secondPlaceholder,
      uncreatedPlaceholder,
    ]);

    reconcilePostedAgentMessages(
      list.data,
      [firstPlaceholder, secondPlaceholder, uncreatedPlaceholder],
      [first, second]
    );

    expect(list.getMessages().map((message) => message.sId)).toEqual([
      "message_1",
      "message_2",
    ]);
  });

  it("inserts a returned message when no optimistic row was created", () => {
    const posted = makePostedMessage("message_2", 3);
    const earlier = makeInitialMessageStreamState(
      makePostedMessage("message_1", 2)
    );
    const later = makeInitialMessageStreamState(
      makePostedMessage("message_3", 4)
    );
    const list = makeData([earlier, later]);

    reconcilePostedAgentMessages(list.data, [], [posted]);

    expect(list.getMessages().map((message) => message.sId)).toEqual([
      "message_1",
      "message_2",
      "message_3",
    ]);
  });

  it("inserts a returned message when its optimistic row disappeared", () => {
    const posted = makePostedMessage("message_2", 3);
    const placeholder = makePlaceholder(posted);
    const list = makeData([]);

    reconcilePostedAgentMessages(list.data, [placeholder], [posted]);

    expect(list.getMessages().map((message) => message.sId)).toEqual([
      "message_2",
    ]);
  });
});
