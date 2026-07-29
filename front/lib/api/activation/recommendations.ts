import type { Authenticator } from "@app/lib/auth";
import type { ActivationRecommendationStatus } from "@app/lib/models/activation/activation_recommendation";
import { ActivationRecommendationResource } from "@app/lib/resources/activation_recommendation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

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
  auth: Authenticator,
  { podId }: { podId?: string } = {}
): Promise<ActivationRecommendationForUserType[]> {
  let spaceModelId: number | undefined;
  if (podId !== undefined) {
    const space = await SpaceResource.fetchById(auth, podId);
    if (!space) {
      return [];
    }
    spaceModelId = space.id;
  }

  const recs = await ActivationRecommendationResource.listSuggestedByUser(
    auth,
    {
      limit: NEXT_STEPS_LIMIT,
      sinceDaysAgo: NEXT_STEPS_WINDOW_DAYS,
      spaceModelId,
    }
  );

  return recs.map(({ resource, conversationSId }) => ({
    sId: resource.sId,
    title: resource.title,
    content: resource.content,
    conversationId: conversationSId,
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
