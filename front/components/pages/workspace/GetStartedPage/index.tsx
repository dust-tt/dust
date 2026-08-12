import { AssistantLayout } from "@app/components/assistant/AssistantLayout";
import { ActivationRunningBanner } from "@app/components/pages/workspace/GetStartedPage/ActivationRunningBanner";
import { JustAskComposer } from "@app/components/pages/workspace/GetStartedPage/JustAskComposer";
import { PreviouslyDoneRow } from "@app/components/pages/workspace/GetStartedPage/PreviouslyDoneRow";
import { RecentConversations } from "@app/components/pages/workspace/GetStartedPage/RecentConversations";
import { RecommendationItem } from "@app/components/pages/workspace/GetStartedPage/RecommendationItem";
import {
  WORK_AREA_ACTIONS,
  WorkAreaSection,
} from "@app/components/pages/workspace/GetStartedPage/WorkAreaSection";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { usePodConversations } from "@app/hooks/conversations";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import {
  useActivationPod,
  useActivationRecommendations,
} from "@app/lib/swr/activation";
import { usePodMetadata } from "@app/lib/swr/pods";
import { getConversationRoute } from "@app/lib/utils/router";
import { resolveDefaultAgentId } from "@app/types/user";
import { Button, Spinner } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

const QUICK_PROMPTS = [
  {
    label: "Scan my connected sources to understand my work.",
    message: WORK_AREA_ACTIONS[0].message,
  },
  {
    label: "Ask me questions to learn how I work.",
    message: WORK_AREA_ACTIONS[1].message,
  },
  {
    label: "How does my learning space work?",
    message: "How does my learning space work?",
  },
];

export function GetStartedPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

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
  const { conversations } = usePodConversations({
    workspaceId: owner.sId,
    podId: activationPodId,
    options: { disabled: isActivationPodLoading },
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

  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const startConversation = useCallback(
    async (input: string) => {
      const res = await createConversationWithMessage({
        messageData: {
          input,
          mentions: defaultAgentId ? [{ configurationId: defaultAgentId }] : [],
          contentFragments: { uploaded: [], contentNodes: [] },
        },
        spaceId: activationPodId,
      });

      if (res.isErr()) {
        sendNotification({
          type: "error",
          title: "Couldn't start conversation",
          description: res.error.message,
        });
        return;
      }

      await router.push(getConversationRoute(owner.sId, res.value.sId));
    },
    [
      activationPodId,
      createConversationWithMessage,
      defaultAgentId,
      owner.sId,
      router,
      sendNotification,
    ]
  );

  const generateIdea = useCallback(async () => {
    setIsGeneratingIdea(true);
    await startConversation("Generate a new idea for me");
    setIsGeneratingIdea(false);
  }, [startConversation]);

  const firstName = user?.firstName ?? user?.fullName?.split(" ")[0] ?? "there";

  return (
    <AssistantLayout owner={owner} user={user}>
      <div className="relative min-h-full w-full overflow-x-hidden bg-background">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, color-mix(in oklch, var(--color-border) 20%, transparent) 1px, transparent 1px)",
            backgroundSize: "calc(100% / 7) 100%",
          }}
        />
        <img
          alt=""
          aria-hidden
          className="pointer-events-none absolute -top-[307.6px] left-[227.4px] w-[1067.2px] max-w-none"
          src={
            isDark
              ? "/static/activation/for-you-orb-large-dark.svg"
              : "/static/activation/for-you-orb-large.svg"
          }
        />
        <img
          alt=""
          aria-hidden
          className="pointer-events-none absolute -top-[307.6px] -left-[72.6px] w-[859.2px] max-w-none"
          src={
            isDark
              ? "/static/activation/for-you-orb-small-dark.svg"
              : "/static/activation/for-you-orb-small.svg"
          }
        />
        <div className="relative mx-auto w-full max-w-2xl px-4 pb-16 pt-[15vh] sm:px-8 lg:mx-0 lg:ml-[9%] lg:w-[53%] lg:max-w-none lg:px-0">
          <div className="flex flex-col gap-1">
            <h1 className="text-5xl font-medium leading-[52px] tracking-[-0.06em] text-foreground">
              Welcome back, {firstName}.
            </h1>
            <h1 className="text-5xl font-medium leading-[52px] tracking-[-0.06em] text-highlight">
              This is your learning space
            </h1>
          </div>

          <div className="mt-6 h-px w-[82px] bg-highlight-200" />

          <p className="mt-6 text-sm leading-5 tracking-tight text-muted-foreground">
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

          <div className="mt-12 rounded-2xl border border-border bg-background px-6 pb-4 pt-6 shadow-sm">
            <h2 className="text-xl font-semibold leading-7 tracking-tight text-foreground">
              Ideas for right now
            </h2>
            <p className="mt-1 text-sm leading-5 tracking-tight text-muted-foreground">
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
                    <div className="py-4">
                      {runningConversation ? (
                        <ActivationRunningBanner
                          owner={owner}
                          runningConversation={runningConversation}
                          message="An agent is actively looking for ideas for you."
                        />
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">
                            No new ideas yet. Let Dust suggest things to try.
                          </p>
                          <div className="mt-4">
                            <Button
                              variant="outline"
                              size="sm"
                              isRounded
                              label="Generate a new idea for me"
                              disabled={isGeneratingIdea}
                              onClick={() => void generateIdea()}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      {recommendations.map((rec) => (
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
                      ))}
                    </>
                  )}
                  <PreviouslyDoneRow owner={owner} podId={activationPodId} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-12">
            <h2 className="text-base font-semibold leading-6 tracking-tight text-foreground">
              Or just ask
            </h2>
            <p className="mt-1 text-sm leading-5 tracking-tight text-muted-foreground">
              New here? Start with one of these to see what your agents can do.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <Button
                  key={prompt.label}
                  variant="outline"
                  size="sm"
                  isRounded
                  label={prompt.label}
                  onClick={() => void startConversation(prompt.message)}
                />
              ))}
            </div>
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
