import {
  recencyLabel,
  SOURCE_META_SEPARATOR,
} from "@app/components/pages/workspace/GetStartedPage/recency";
import { SourceIcon } from "@app/components/pages/workspace/GetStartedPage/SourceIcon";
import type { ActivationRecommendationForUserType } from "@app/lib/api/activation/recommendations";
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
  const [isUpdating, setIsUpdating] = useState(false);
  const { updateRecommendation } = useUpdateActivationRecommendation({
    workspaceId: owner.sId,
  });

  const handleDismiss = async () => {
    setIsUpdating(true);
    await updateRecommendation(rec.sId, { status: "dismissed" });
    onResolved();
  };

  return (
    <div className="py-4">
      <button
        type="button"
        onClick={onToggle}
        className="relative flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-sm leading-5">
            {rec.sourceIcon && <SourceIcon sourceIcon={rec.sourceIcon} />}
            <span className="text-muted-foreground">
              {rec.sourceLabel ?? "Suggested for you"}
            </span>
            <span className="text-faint">
              {SOURCE_META_SEPARATOR} {recencyLabel(rec.createdAt)}
            </span>
          </div>
          <h3 className="text-base font-semibold leading-6 tracking-tight text-foreground">
            {rec.title}
          </h3>
          <p className="text-sm leading-5 tracking-tight text-muted-foreground">
            {rec.content}
          </p>
        </div>
        <Icon
          visual={expanded ? ChevronUp : ChevronDown}
          size="sm"
          className="mt-0.5 shrink-0 text-faint"
        />
      </button>

      {expanded && (
        <>
          {rec.body && (
            <p className="mt-4 text-sm leading-5 tracking-tight text-foreground">
              {rec.body}
            </p>
          )}

          {rec.steps && rec.steps.length > 0 && (
            <ol className="mt-4 flex flex-col gap-2">
              {rec.steps.map((step, i) => (
                <li key={step} className="flex items-start gap-2 text-sm">
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted-background px-1 text-xs font-semibold leading-4 text-muted-foreground shadow-sm">
                    {i + 1}
                  </span>
                  <span className="leading-5 text-muted-foreground">
                    {step}
                  </span>
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
              icon={ArrowRight}
              disabled={isUpdating}
              href={getConversationRoute(owner.sId, rec.conversationId)}
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
