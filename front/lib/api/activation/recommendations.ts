import type { Authenticator } from "@app/lib/auth";
import type { ActivationPodKind } from "@app/lib/models/activation/activation_pod";
import type { ActivationRecommendationStatus } from "@app/lib/models/activation/activation_recommendation";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ActivationRecommendationResource } from "@app/lib/resources/activation_recommendation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

const NEXT_STEPS_WINDOW_DAYS = 30;
const SUGGESTED_LIMIT = 5;
const EXECUTED_LIMIT = 20;

export interface ActivationRecommendationForUserType {
  sId: string;
  title: string;
  content: string;
  body: string | null;
  steps: string[] | null;
  ctaLabel: string | null;
  sourceIcon: string | null;
  sourceLabel: string | null;
  conversationId: string | null;
  createdAt: number;
}

export interface GetActivationRecommendationsResponseBody {
  recommendations: ActivationRecommendationForUserType[];
}

export interface GetActivationPodResponseBody {
  podId: string | null;
  kind: ActivationPodKind | null;
}

export async function getActivationPodInfo(
  auth: Authenticator,
  { podId }: { podId?: string } = {}
): Promise<GetActivationPodResponseBody> {
  if (podId) {
    const space = await SpaceResource.fetchById(auth, podId);
    if (!space) {
      return { podId: null, kind: null };
    }
    const activationPod = await ActivationPodResource.fetchBySpace(auth, space);
    return {
      podId: activationPod ? space.sId : null,
      kind: activationPod?.kind ?? null,
    };
  }

  const allPods = await ActivationPodResource.listByUser(auth);
  const learningPod = allPods.find((p) => p.kind === "learning") ?? null;
  if (!learningPod) {
    return { podId: null, kind: null };
  }
  const [pod] = await SpaceResource.fetchByModelIds(auth, [
    learningPod.spaceId,
  ]);
  if (!pod) {
    return { podId: null, kind: null };
  }
  return {
    podId: pod.sId,
    kind: "learning",
  };
}

export interface UpdateActivationRecommendationResponseBody {
  success: true;
}

export async function listActivationRecommendationsForUser(
  auth: Authenticator,
  {
    podId,
    status = "suggested",
  }: { podId?: string; status?: ActivationRecommendationStatus } = {}
): Promise<ActivationRecommendationForUserType[]> {
  let spaceModelId: number | undefined;
  let activationPodModelId: number | undefined;
  if (podId !== undefined) {
    const space = await SpaceResource.fetchById(auth, podId);
    if (!space) {
      return [];
    }
    spaceModelId = space.id;
    const activationPod = await ActivationPodResource.fetchBySpace(auth, space);
    if (!activationPod) {
      return [];
    }
    activationPodModelId = activationPod.id;
  }

  const recs = await ActivationRecommendationResource.listByUserAndStatus(
    auth,
    {
      status,
      limit: status === "executed" ? EXECUTED_LIMIT : SUGGESTED_LIMIT,
      sinceDaysAgo: NEXT_STEPS_WINDOW_DAYS,
      spaceModelId,
      activationPodModelId,
    }
  );

  return recs.map(({ resource, conversationSId }) => ({
    sId: resource.sId,
    title: resource.title,
    content: resource.content,
    body: resource.body,
    steps: resource.steps,
    ctaLabel: resource.ctaLabel,
    sourceIcon: resource.sourceIcon,
    sourceLabel: resource.sourceLabel,
    conversationId: conversationSId,
    createdAt: resource.createdAt.getTime(),
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

  const [activationPod] = rec.activationPodId
    ? await ActivationPodResource.fetchByModelIds(auth, [rec.activationPodId])
    : [];
  const [space] = activationPod
    ? await SpaceResource.fetchByModelIds(auth, [activationPod.spaceId])
    : [];
  const canUpdate = rec.activationPodId
    ? Boolean(space && auth.can("admin", space))
    : rec.userId === auth.getNonNullableUser().id;
  if (!canUpdate) {
    return "not_found";
  }

  await rec.updateFields({ status });

  return "ok";
}
