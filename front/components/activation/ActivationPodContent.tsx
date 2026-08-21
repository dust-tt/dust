import { ActivationRunningBanner } from "@app/components/activation/ActivationRunningBanner";
import { PreviouslyDoneRow } from "@app/components/activation/PreviouslyDoneRow";
import { RecommendationItem } from "@app/components/activation/RecommendationItem";
import { WorkAreaSection } from "@app/components/activation/WorkAreaSection";
import { usePodConversations } from "@app/hooks/conversations";
import { useActivationRecommendations } from "@app/lib/swr/activation";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Button, Spinner } from "@dust-tt/sparkle";
import { useState } from "react";

interface ActivationPodContentProps {
  owner: WorkspaceType;
  user: UserType | null;
  podId: string;
  defaultAgentId: string | null;
  isGenerating?: boolean;
  onGenerate?: () => void;
}

export function ActivationPodContent({
  owner,
  user,
  podId,
  defaultAgentId,
  isGenerating,
  onGenerate,
}: ActivationPodContentProps) {
  const { recommendations, isRecommendationsLoading, mutateRecommendations } =
    useActivationRecommendations({
      workspaceId: owner.sId,
      podId,
    });
  const { conversations } = usePodConversations({
    workspaceId: owner.sId,
    podId,
  });
  const runningConversation =
    conversations.find((conversation) => conversation.isRunningAgentLoop) ??
    null;

  // `undefined` = untouched (default to first open, per the design); `null` =
  // user explicitly collapsed everything; string = a specific item is open.
  const [expandedId, setExpandedId] = useState<string | null | undefined>(
    undefined
  );
  const effectiveExpandedId =
    expandedId === undefined ? (recommendations[0]?.sId ?? null) : expandedId;

  return (
    <>
      <WorkAreaSection
        owner={owner}
        user={user}
        podId={podId}
        defaultAgentId={defaultAgentId}
      />

      <div className="mt-12 rounded-2xl border border-border bg-background px-6 pb-4 pt-6 shadow-sm">
        <h2 className="text-xl font-semibold leading-7 tracking-tight text-foreground">
          Ideas for right now
        </h2>
        <p className="mt-1 text-sm leading-5 tracking-tight text-muted-foreground">
          These change as you work. New ones surface as your context shifts.
        </p>

        <div className="mt-6 border-t border-border">
          {isRecommendationsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner size="md" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recommendations.length === 0 ? (
                <div className="py-4">
                  {runningConversation ? (
                    <ActivationRunningBanner
                      owner={owner}
                      runningConversation={runningConversation}
                      message="An agent is actively looking for ideas for you."
                    />
                  ) : (
                    <>
                      <p className="text-sm leading-5 tracking-tight text-muted-foreground">
                        No new ideas yet. Let Dust suggest things to try.
                      </p>
                      {onGenerate && (
                        <div className="mt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            isRounded
                            label="Generate a new idea for me"
                            disabled={isGenerating}
                            onClick={onGenerate}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                recommendations.map((rec) => (
                  <RecommendationItem
                    key={rec.sId}
                    rec={rec}
                    owner={owner}
                    expanded={rec.sId === effectiveExpandedId}
                    onToggle={() =>
                      setExpandedId(
                        rec.sId === effectiveExpandedId ? null : rec.sId
                      )
                    }
                    onResolved={() => void mutateRecommendations()}
                  />
                ))
              )}
              <PreviouslyDoneRow owner={owner} podId={podId} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
