import type {
  AgentMessageWithStreaming,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  isPlaceholderMessage,
  makeInitialMessageStreamState,
} from "@app/components/assistant/conversation/types";
import type { LightAgentMessageType } from "@app/types/assistant/conversation";
import type { VirtuosoMessageListMethods } from "@virtuoso.dev/message-list";

/**
 * @cc [owner:id13,label:react;concurrency] posted-agent-placeholder-resolution
 * A successful message post MUST show its returned agent messages, resolve optimistic rows, and
 * preserve real rows that already received stream events.
 */
export function reconcilePostedAgentMessages(
  data: Pick<
    VirtuosoMessageListMethods<
      VirtuosoMessage,
      VirtuosoMessageListContext
    >["data"],
    "append" | "findAndDelete" | "get" | "insert" | "map"
  >,
  placeholders: AgentMessageWithStreaming[],
  postedMessages: LightAgentMessageType[]
): void {
  const messageIds = new Set(data.get().map((message) => message.sId));
  const messagesByConfiguration = new Map<string, LightAgentMessageType[]>();
  for (const message of postedMessages) {
    const configurationId = message.configuration.sId;
    const messages = messagesByConfiguration.get(configurationId) ?? [];
    messages.push(message);
    messagesByConfiguration.set(configurationId, messages);
  }

  for (const placeholder of placeholders) {
    const posted = messagesByConfiguration
      .get(placeholder.configuration.sId)
      ?.shift();
    if (!posted) {
      continue;
    }

    if (messageIds.has(posted.sId)) {
      continue;
    }

    const realMessage = makeInitialMessageStreamState(posted);
    let replaced = false;
    data.map((message) => {
      if (
        message.sId === placeholder.sId &&
        message.rank === placeholder.rank
      ) {
        replaced = true;
        return realMessage;
      }
      return message;
    });
    if (replaced) {
      messageIds.add(posted.sId);
    }
  }

  const placeholderRanks = new Set(
    placeholders.map((placeholder) => placeholder.rank)
  );
  data.findAndDelete(
    (message) =>
      isPlaceholderMessage(message) && placeholderRanks.has(message.rank)
  );

  for (const posted of postedMessages) {
    if (messageIds.has(posted.sId)) {
      continue;
    }
    const realMessage = makeInitialMessageStreamState(posted);
    const offset = data
      .get()
      .findIndex((message) => message.rank > posted.rank);
    if (offset === -1) {
      data.append([realMessage]);
    } else {
      data.insert([realMessage], offset);
    }
    messageIds.add(posted.sId);
  }
}
