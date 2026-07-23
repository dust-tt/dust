import type { Authenticator } from "@app/lib/auth";
import type { ActivationRecommendationStatus } from "@app/lib/models/activation/activation_recommendation";
import { ActivationRecommendationResource } from "@app/lib/resources/activation_recommendation_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { removeNulls } from "@app/types/shared/utils/general";

const NEXT_STEPS_WINDOW_DAYS = 30;
const NEXT_STEPS_LIMIT = 5;

export interface ActivationRecommendationForUserType {
  sId: string;
  title: string;
  content: string;
  conversationId: string | null;
}

export interface GetActivationRecommendationsResponseBody {
  recommendations: ActivationRecommendationForUserType[];
}

export interface UpdateActivationRecommendationResponseBody {
  success: true;
}

export async function listActivationRecommendationsForUser(
  auth: Authenticator
): Promise<ActivationRecommendationForUserType[]> {
  const recs = await ActivationRecommendationResource.listSuggestedByUser(
    auth,
    {
      limit: NEXT_STEPS_LIMIT,
      sinceDaysAgo: NEXT_STEPS_WINDOW_DAYS,
    }
  );

  const conversationModelIds = removeNulls(
    recs.map((rec) => rec.conversationId)
  );
  const conversations =
    conversationModelIds.length === 0
      ? []
      : await ConversationResource.fetchByModelIds(auth, conversationModelIds);
  const sIdByModelId = new Map(conversations.map((c) => [c.id, c.sId]));

  return recs.map((rec) => ({
    sId: rec.sId,
    title: rec.title,
    content: rec.content,
    conversationId:
      rec.conversationId !== null
        ? (sIdByModelId.get(rec.conversationId) ?? null)
        : null,
  }));
}

export async function updateActivationRecommendationForUser(
  auth: Authenticator,
  {
    recommendationId,
    status,
  }: {
    recommendationId: string;
    status?: Exclude<ActivationRecommendationStatus, "suggested">;
  }
): Promise<"not_found" | "ok"> {
  const rec = await ActivationRecommendationResource.fetchById(
    auth,
    recommendationId
  );
  if (!rec) {
    return "not_found";
  }

  await rec.updateFields({ status });

  return "ok";
}
