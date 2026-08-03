import { PodFunctionCard } from "@app/components/pod/functions/PodFunctionCard";
import {
  usePodFunctionFrameUsage,
  usePodFunctions,
} from "@app/hooks/usePodFunctions";
import type { PodType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessageInline, Spinner } from "@dust-tt/sparkle";

interface PodFunctionsTabProps {
  owner: LightWorkspaceType;
  pod: PodType;
}

export function PodFunctionsTab({ owner, pod }: PodFunctionsTabProps) {
  const { podFunctions, isPodFunctionsLoading, isPodFunctionsError } =
    usePodFunctions({ workspaceId: owner.sId, podId: pod.sId });

  // Resolves after the listing and only fills in a line on each card, so the tab never waits on
  // it. Errors are silent for the same reason: a missing "used by" is not worth an alert.
  const { framesByFunctionId } = usePodFunctionFrameUsage({
    workspaceId: owner.sId,
    podId: pod.sId,
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6 py-8">
      <div className="flex flex-col gap-1 pb-4">
        <h2 className="text-lg font-semibold">Functions</h2>
        <span className="text-sm text-muted-foreground">
          Code this pod can run. Ask an agent in this pod to add, change or
          remove one.
        </span>
      </div>
      {isPodFunctionsLoading ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">
            Loading functions...
          </span>
        </div>
      ) : isPodFunctionsError ? (
        <ContentMessageInline variant="warning">
          Unable to load this pod's functions.
        </ContentMessageInline>
      ) : (
        <div className="flex flex-col gap-3">
          {podFunctions.map((podFunction) => (
            <PodFunctionCard
              key={podFunction.sId}
              podFunction={podFunction}
              podId={pod.sId}
              usedByFrames={framesByFunctionId.get(podFunction.sId) ?? []}
              workspaceId={owner.sId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
