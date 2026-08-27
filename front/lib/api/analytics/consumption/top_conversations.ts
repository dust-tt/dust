import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { fetchConsumptionTopGroups } from "@app/lib/api/analytics/consumption/top";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

export type ConsumptionTopConversationRow = {
  conversationId: string;
  title: string;
  totalCredits: number;
};

export type ConsumptionTopConversations = {
  period: ConsumptionPeriod;
  conversations: ConsumptionTopConversationRow[];
};

export type GetConsumptionTopConversationsResponse =
  ConsumptionTopConversations;

export async function fetchConsumptionTopConversations(
  auth: Authenticator,
  {
    period,
    limit,
    filter,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTopConversations, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "conversation",
    period,
    limit,
    filter,
  });
  if (result.isErr()) {
    return result;
  }

  const conversations = await ConversationResource.fetchByIds(
    auth,
    result.value.groups.map((group) => group.key),
    { includeDeleted: true }
  );
  const conversationMetadataById = new Map(
    conversations.map((conversation) => [
      conversation.sId,
      {
        conversationId: conversation.sId,
        title: getConversationDisplayTitle({
          created: conversation.createdAt.getTime(),
          forkingData: conversation.forkingData,
          title: conversation.title,
        }),
      },
    ])
  );

  return new Ok({
    period,
    conversations: result.value.groups.flatMap((group) => {
      const conversation = conversationMetadataById.get(group.key);
      return conversation
        ? [
            {
              ...conversation,
              totalCredits: group.credits,
            },
          ]
        : [];
    }),
  });
}
