import { listPodFrameFunctionUsage } from "@app/lib/api/viz/frame_pod_function_usage";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  PodFunctionFailureType,
  PodFunctionFrameUsageType,
  PodFunctionType,
} from "@app/types/api/sandbox_functions";
import { removeNulls } from "@app/types/shared/utils/general";

const ACTIVITY_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The pod's published functions, as its members see them: contract and recent activity, no
 * source and no invocation payloads.
 */
export async function listPodFunctions(
  auth: Authenticator,
  space: SpaceResource
): Promise<PodFunctionType[]> {
  const sandboxFunctions = await SandboxFunctionResource.listBySpace(
    auth,
    space
  );
  if (sandboxFunctions.length === 0) {
    return [];
  }

  const countSince = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * MS_PER_DAY);
  const activityByFunctionModelId =
    await SandboxFunctionInvocationResource.activityForSandboxFunctions(auth, {
      sandboxFunctions,
      countSince,
    });

  const authors = await UserResource.fetchByModelIds(
    removeNulls(
      sandboxFunctions.map((sandboxFunction) => sandboxFunction.file.userId)
    )
  );
  const authorsByModelId = new Map(
    authors.map((author) => [author.id, author])
  );

  return sandboxFunctions.map((sandboxFunction) => {
    const { userId } = sandboxFunction.file;
    const author = userId !== null ? authorsByModelId.get(userId) : undefined;

    const activity = activityByFunctionModelId.get(sandboxFunction.id) ?? {
      lastRunAt: null,
      lastRunStatus: null,
      runCountLastWeek: 0,
    };

    return sandboxFunction.toJSON(author ?? null, activity);
  });
}

/**
 * Which of the pod's published frames call each of its functions. Kept out of `listPodFunctions`
 * because it reads a GCS object per frame while the listing itself is pure DB: the tab renders
 * from the listing and fills usage in when this resolves.
 */
export async function listPodFunctionFrameUsage(
  auth: Authenticator,
  space: SpaceResource
): Promise<PodFunctionFrameUsageType[]> {
  const sandboxFunctions = await SandboxFunctionResource.listBySpace(
    auth,
    space
  );

  const usageByFunctionId = await listPodFrameFunctionUsage(auth, {
    space,
    sandboxFunctions,
  });

  return [...usageByFunctionId].map(([functionId, frames]) => ({
    functionId,
    frames,
  }));
}

/**
 * Why a function last failed, for the callers allowed to see that run: a pod administrator sees
 * any run, a member only their own. Null covers both "it never failed" and "the failing run
 * belongs to someone else" — the caller cannot tell the two apart, which is the point.
 */
export async function getPodFunctionLastFailure(
  auth: Authenticator,
  {
    space,
    podFunctionId,
  }: {
    space: SpaceResource;
    podFunctionId: string;
  }
): Promise<PodFunctionFailureType | null> {
  const sandboxFunction = await SandboxFunctionResource.fetchById(
    auth,
    podFunctionId
  );
  if (!sandboxFunction || sandboxFunction.spaceId !== space.id) {
    return null;
  }

  const invocation = await SandboxFunctionInvocationResource.fetchLastFailure(
    auth,
    { sandboxFunction }
  );

  return invocation ? invocation.toFailureJSON() : null;
}
