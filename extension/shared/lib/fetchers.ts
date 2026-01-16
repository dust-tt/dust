import type {
  AgentConfigurationViewType,
  ConversationPublicType,
  ConversationWithoutContentPublicType,
  DustAPI,
  LightAgentConfigurationType,
} from "@dust-tt/client";

import type { ConversationKey } from "./hook-types";

/**
 * Creates a fetcher for agent configurations.
 * Returns an async function that fetches all agent configurations.
 */
export function createAgentConfigurationsFetcher(
  dustAPI: DustAPI | null,
  view?: AgentConfigurationViewType,
  includes?: "authors"[]
): () => Promise<LightAgentConfigurationType[]> {
  return async () => {
    if (!dustAPI) {
      return [];
    }
    const res = await dustAPI.getAgentConfigurations({ view, includes });
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };
}

/**
 * Creates a fetcher for conversations list.
 * Returns an async function that fetches all conversations.
 */
export function createConversationsFetcher(
  dustAPI: DustAPI | null
): () => Promise<ConversationWithoutContentPublicType[]> {
  return async () => {
    if (!dustAPI) {
      return [];
    }
    const res = await dustAPI.getConversations();
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };
}

/**
 * Creates a fetcher for a single conversation.
 * Returns an async function that fetches a conversation by key.
 */
export function createConversationFetcher(
  dustAPI: DustAPI | null
): (key: ConversationKey) => Promise<ConversationPublicType | null> {
  return async (key: ConversationKey) => {
    if (!key || !dustAPI) {
      return null;
    }
    const res = await dustAPI.getConversation(key[2]);
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };
}
