import { usePodLabel } from "@app/components/assistant/conversation/tool_validation/usePodLabel";
import { useConversation } from "@app/hooks/conversations/useConversation";
import { parsePodConfigurationURI } from "@app/lib/actions/mcp_internal_actions/pod_configuration_uri";
import type { PodManagerEditInformationInput } from "@app/lib/api/actions/servers/pod_manager/types";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface PodEditInformationValidationDetailsProps {
  input: PodManagerEditInformationInput;
  owner: LightWorkspaceType;
  conversationId?: string | null;
}

interface ChangeRowProps {
  label: string;
  before: string;
  after: string;
}

function formatAccess(access: "restricted" | "open"): string {
  return access === "open" ? "Open" : "Restricted";
}

function formatPinnedFramePath(path: string | null | undefined): string {
  if (path === null) {
    return "Unpinned";
  }
  if (path === undefined) {
    return "—";
  }
  return path;
}

function ChangeRow({ label, before, after }: ChangeRowProps) {
  const hasChanged = before !== after;

  return (
    <div className="flex flex-col gap-1 px-3 py-2.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{before}</span>
        {hasChanged && (
          <>
            <span className="text-muted-foreground">→</span>
            <span className="font-medium text-foreground">{after}</span>
          </>
        )}
        {!hasChanged && <Chip size="xs" color="primary" label="No change" />}
      </div>
    </div>
  );
}

export function PodEditInformationValidationDetails({
  input,
  owner,
  conversationId,
}: PodEditInformationValidationDetailsProps) {
  const { podLabel, isPodLabelLoading } = usePodLabel({
    owner,
    dustPodUri: input.dustPod?.uri,
    conversationId,
  });

  const { conversation, isConversationLoading } = useConversation({
    workspaceId: owner.sId,
    conversationId: conversationId ?? null,
    options: { disabled: !conversationId },
  });

  const podSpaceId = useMemo(() => {
    if (input.dustPod?.uri) {
      const parsed = parsePodConfigurationURI(input.dustPod.uri);
      if (parsed.isOk()) {
        return parsed.value.podId;
      }
      return null;
    }
    return conversation?.spaceId ?? null;
  }, [conversation?.spaceId, input.dustPod?.uri]);

  const isWaitingForConversationSpaceId =
    !input.dustPod?.uri && !!conversationId && isConversationLoading;

  const { spaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: podSpaceId,
    disabled: !podSpaceId,
  });

  const isCurrentPodInfoLoading =
    isWaitingForConversationSpaceId ||
    (podSpaceId !== null && isSpaceInfoLoading && !spaceInfo);

  const currentAccess = spaceInfo
    ? spaceInfo.isRestricted
      ? "restricted"
      : "open"
    : null;

  const changes: ChangeRowProps[] = [];

  if (input.title !== undefined) {
    changes.push({
      label: "Title",
      before: spaceInfo?.name ?? (isCurrentPodInfoLoading ? "Loading…" : "—"),
      after: input.title,
    });
  }

  if (input.description !== undefined) {
    changes.push({
      label: "Description",
      before:
        spaceInfo?.description ?? (isCurrentPodInfoLoading ? "Loading…" : "—"),
      after: input.description,
    });
  }

  if (input.access !== undefined) {
    changes.push({
      label: "Access",
      before: currentAccess
        ? formatAccess(currentAccess)
        : isCurrentPodInfoLoading
          ? "Loading…"
          : "—",
      after: formatAccess(input.access),
    });
  }

  if (input.pinnedFramePath !== undefined) {
    changes.push({
      label: "Pinned frame",
      before: isCurrentPodInfoLoading
        ? "Loading…"
        : formatPinnedFramePath(spaceInfo?.pinnedFramePath ?? undefined),
      after: formatPinnedFramePath(input.pinnedFramePath),
    });
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-sm text-muted-foreground">
        The agent wants to update information for{" "}
        <span className="font-medium text-foreground">
          {isPodLabelLoading ? "Loading…" : podLabel}
        </span>
        .
      </p>

      {changes.length > 0 && (
        <div className="divide-y divide-separator overflow-hidden rounded-xl border border-separator bg-background">
          {changes.map((change) => (
            <ChangeRow key={change.label} {...change} />
          ))}
        </div>
      )}
    </div>
  );
}
