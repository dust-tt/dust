import { usePodFunctionLastFailure } from "@app/hooks/usePodFunctions";
import { ContentMessageInline, Spinner } from "@dust-tt/sparkle";

interface PodFunctionLastFailureProps {
  disabled: boolean;
  functionId: string;
  podId: string;
  workspaceId: string;
}

export function PodFunctionLastFailure({
  disabled,
  functionId,
  podId,
  workspaceId,
}: PodFunctionLastFailureProps) {
  const { failure, isFailureLoading, isFailureError } =
    usePodFunctionLastFailure({
      workspaceId,
      podId,
      functionId,
      disabled,
    });

  if (isFailureLoading) {
    return (
      <div className="flex items-center gap-2">
        <Spinner size="sm" />
        <span className="text-sm text-muted-foreground">
          Loading the last failure...
        </span>
      </div>
    );
  }

  if (isFailureError) {
    return (
      <ContentMessageInline variant="warning">
        Unable to load the last failure.
      </ContentMessageInline>
    );
  }

  // The activity summary is pod-wide but the failing run itself is not: a member only sees their
  // own runs, a pod administrator sees all of them.
  if (!failure) {
    return (
      <span className="text-sm text-muted-foreground">
        That run isn't visible to you. Ask an agent in this pod to inspect it.
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-xs text-warning">
        {failure.code}
        {failure.status !== undefined && ` (${failure.status})`}
      </span>
      <span className="text-sm">{failure.message}</span>
    </div>
  );
}
