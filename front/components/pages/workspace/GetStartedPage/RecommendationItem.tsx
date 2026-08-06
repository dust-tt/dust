import {
  recencyLabel,
  SOURCE_META_SEPARATOR,
} from "@app/components/pages/workspace/GetStartedPage/recency";
import { SourceIcon } from "@app/components/pages/workspace/GetStartedPage/SourceIcon";
import type { ActivationRecommendationForUserType } from "@app/lib/api/activation/recommendations";
import { useAppRouter } from "@app/lib/platform";
import { useUpdateActivationRecommendation } from "@app/lib/swr/activation";
import { getConversationRoute } from "@app/lib/utils/router";
import {
  ArrowRight,
  Button,
  ChevronDown,
  ChevronUp,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface RecommendationItemProps {
  rec: ActivationRecommendationForUserType;
  owner: { sId: string };
  expanded: boolean;
  onToggle: () => void;
  onResolved: () => void;
}

export function RecommendationItem({
  rec,
  owner,
  expanded,
  onToggle,
  onResolved,
}: RecommendationItemProps) {
  const router = useAppRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const { updateRecommendation } = useUpdateActivationRecommendation({
    workspaceId: owner.sId,
  });

  // "Create this agent" deep-links into the activation conversation where this
  // recommendation was surfaced; the agent marks it executed once the work
  // actually runs there (via the update_recommendation tool). We don't mark it
  // executed on click — clicking is navigation, not completion.
  const handleCreate = () => {
    void router.push(getConversationRoute(owner.sId, rec.conversationId));
  };

  const handleDismiss = async () => {
    setIsUpdating(true);
    await updateRecommendation(rec.sId, { status: "dismissed" });
    onResolved();
  };

  return (
    <div className="py-6">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2 text-sm">
          {rec.sourceIcon && <SourceIcon sourceIcon={rec.sourceIcon} />}
          <span className="text-muted-foreground">
            {rec.sourceLabel ?? "Suggested for you"}
          </span>
          <span className="text-faint">
            {SOURCE_META_SEPARATOR} {recencyLabel(rec.createdAt)}
          </span>
        </div>
        <Icon
          visual={expanded ? ChevronUp : ChevronDown}
          size="sm"
          className="shrink-0 text-faint"
        />
      </button>

      <h3 className="mt-2 text-base font-semibold text-foreground">
        {rec.title}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{rec.content}</p>

      {expanded && (
        <>
          {rec.body && (
            <p className="mt-4 text-sm leading-relaxed text-foreground">
              {rec.body}
            </p>
          )}

          {rec.steps && rec.steps.length > 0 && (
            <ol className="mt-4 flex flex-col gap-3">
              {rec.steps.map((step, i) => (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-dark text-xs text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-6 flex items-center gap-2">
            <Button
              variant="highlight"
              size="sm"
              isRounded
              label={rec.ctaLabel ?? "Create this agent"}
              iconRight={ArrowRight}
              disabled={isUpdating}
              onClick={handleCreate}
            />
            <Button
              variant="outline"
              size="sm"
              isRounded
              label="Not now"
              disabled={isUpdating}
              onClick={handleDismiss}
            />
            {isUpdating && <Spinner size="xs" />}
          </div>
        </>
      )}
    </div>
  );
}
