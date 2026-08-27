import {
  recencyLabel,
  SOURCE_META_SEPARATOR,
} from "@app/components/activation/recency";
import { SourceIcon } from "@app/components/activation/SourceIcon";
import { useAppRouter } from "@app/lib/platform";
import { useActivationRecommendations } from "@app/lib/swr/activation";
import { getConversationRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types/user";
import { ChevronDown, ChevronUp, Icon } from "@dust-tt/sparkle";
import { useState } from "react";

interface PreviouslyDoneRowProps {
  owner: WorkspaceType;
  podId: string | null;
}

export function PreviouslyDoneRow({ owner, podId }: PreviouslyDoneRowProps) {
  const router = useAppRouter();
  const [expanded, setExpanded] = useState(false);
  const { recommendations } = useActivationRecommendations({
    workspaceId: owner.sId,
    podId: podId ?? undefined,
    status: "executed",
  });

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div className="py-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold leading-6 tracking-tight text-foreground">
            Previously done
          </span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-lg bg-highlight-50 px-1.5 text-xs font-medium text-highlight">
            {recommendations.length}
          </span>
        </div>
        <Icon
          visual={expanded ? ChevronUp : ChevronDown}
          size="sm"
          className="shrink-0 text-faint"
        />
      </button>

      {expanded && (
        <div className="mt-4 flex flex-col gap-5">
          {recommendations.map((rec) => (
            <button
              key={rec.sId}
              type="button"
              disabled={!rec.conversationId}
              onClick={() => {
                if (rec.conversationId) {
                  void router.push(
                    getConversationRoute(owner.sId, rec.conversationId),
                    undefined,
                    { shallow: true }
                  );
                }
              }}
              className="flex w-full flex-col gap-1 text-left enabled:hover:opacity-70 disabled:cursor-default"
            >
              <div className="flex items-center gap-2 text-sm">
                {rec.sourceIcon && <SourceIcon sourceIcon={rec.sourceIcon} />}
                <span className="text-muted-foreground">
                  {rec.sourceLabel ?? "Completed"}
                </span>
                <span className="text-faint">
                  {SOURCE_META_SEPARATOR} {recencyLabel(rec.createdAt)}
                </span>
              </div>
              <p className="text-base font-semibold text-foreground">
                {rec.title}
              </p>
              <p className="text-sm text-muted-foreground">{rec.content}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
