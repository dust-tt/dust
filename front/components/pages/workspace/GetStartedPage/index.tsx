import { AssistantLayout } from "@app/components/assistant/AssistantLayout";
import { JustAskComposer } from "@app/components/pages/workspace/GetStartedPage/JustAskComposer";
import { PreviouslyDoneRow } from "@app/components/pages/workspace/GetStartedPage/PreviouslyDoneRow";
import { RecentConversations } from "@app/components/pages/workspace/GetStartedPage/RecentConversations";
import { RecommendationItem } from "@app/components/pages/workspace/GetStartedPage/RecommendationItem";
import { WorkAreaSection } from "@app/components/pages/workspace/GetStartedPage/WorkAreaSection";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import {
  useActivationPod,
  useActivationRecommendations,
} from "@app/lib/swr/activation";
import { usePodMetadata } from "@app/lib/swr/pods";
import { resolveDefaultAgentId } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";
import { useState } from "react";

export function GetStartedPage() {
  const owner = useWorkspace();
  const { user } = useAuth();

  // The whole surface is scoped to the user's activation Pod: recommendations
  // and recent conversations both come from it.
  const { activationPodId, isActivationPodLoading } = useActivationPod({
    workspaceId: owner.sId,
  });

  const { hasFeature } = useFeatureFlags();
  const { podMetadata } = usePodMetadata({
    workspaceId: owner.sId,
    podId: activationPodId,
    disabled: isActivationPodLoading,
  });
  const defaultAgentId = resolveDefaultAgentId({
    owner,
    podDefaultAgentId: podMetadata?.defaultAgentId,
    hasWorkspaceDefaultAgentFeature: hasFeature("workspace_default_agent"),
  });

  const { recommendations, isRecommendationsLoading, mutateRecommendations } =
    useActivationRecommendations({
      workspaceId: owner.sId,
      podId: activationPodId ?? undefined,
      disabled: isActivationPodLoading,
    });

  // `undefined` = untouched (default to first open, per the design); `null` =
  // user explicitly collapsed everything; string = a specific item is open.
  const [expandedId, setExpandedId] = useState<string | null | undefined>(
    undefined
  );
  const effectiveExpandedId =
    expandedId === undefined ? (recommendations[0]?.sId ?? null) : expandedId;

  const firstName = user?.firstName ?? user?.fullName?.split(" ")[0] ?? "there";

  return (
    <AssistantLayout owner={owner} user={user}>
      <div
        className="min-h-full w-full"
        style={{
          background:
            "radial-gradient(120% 90% at 100% 0%, rgba(28,145,255,0.10) 0%, rgba(28,145,255,0) 45%)",
        }}
      >
        <div className="mx-auto max-w-3xl px-8 py-14 md:px-16">
          <h1 className="text-5xl font-bold tracking-tight text-foreground">
            Welcome back, {firstName}.
          </h1>
          <h1 className="text-5xl font-bold tracking-tight text-highlight">
            Let's get started
          </h1>

          <div className="my-6 h-0.5 w-16 rounded-full bg-highlight-200" />

          <p className="text-sm leading-relaxed text-muted-foreground">
            Your own corner of Dust, where your agents and connected tools come
            together.
            <br />
            Nothing here is a demo. It is already wired to how your team works,
            and it is waiting for you.
          </p>

          <WorkAreaSection
            owner={owner}
            user={user}
            podId={activationPodId}
            defaultAgentId={defaultAgentId}
            disabled={isActivationPodLoading}
          />

          <div className="mt-10 rounded-2xl border border-border bg-background p-7 shadow-sm">
            <h2 className="text-xl font-bold text-foreground">
              Ideas for right now
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These change as you work. New ones surface as your context shifts.
            </p>

            <div className="mt-6 border-t border-border">
              {isActivationPodLoading || isRecommendationsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner size="md" />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recommendations.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      No ideas yet. Start a conversation and Dust will suggest
                      things to try.
                    </p>
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
                  <PreviouslyDoneRow owner={owner} podId={activationPodId} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-12">
            <h2 className="text-xl font-bold text-foreground">Or just ask</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              New here? Try one of these, or just start typing.
            </p>
            <div className="mt-4">
              <JustAskComposer
                owner={owner}
                user={user}
                podId={activationPodId}
                defaultAgentId={defaultAgentId}
              />
            </div>
          </div>

          <RecentConversations owner={owner} podId={activationPodId} />
        </div>
      </div>
    </AssistantLayout>
  );
}
