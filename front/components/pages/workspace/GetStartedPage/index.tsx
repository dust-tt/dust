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
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
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
  "Scan my connected sources for repetitive work I can automate.",
  "Ask me questions to learn how I work.",
  "How does my learning space work?",
];

export function GetStartedPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
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
      <div className="relative min-h-full w-full overflow-x-hidden bg-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
        style={{
            backgroundImage: [
              "linear-gradient(to right, rgba(0, 0, 0, 0.02) 1px, transparent 1px)",
              "radial-gradient(68% 52% at 60% -8%, rgba(255, 203, 99, 0.55) 0%, rgba(255, 138, 128, 0.32) 35%, rgba(122, 159, 255, 0.24) 58%, transparent 76%)",
              "radial-gradient(52% 44% at 14% 2%, rgba(132, 202, 255, 0.32) 0%, transparent 72%)",
            ].join(", "),
            backgroundSize: "calc(100% / 7) 100%, 100% 100%, 100% 100%",
        }}
        />
        <div className="relative ml-6 w-[calc(100%-48px)] pb-16 pt-[130px] md:ml-24 md:w-[566px]">
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

          <div className="mt-12 rounded-2xl bg-white px-6 pb-8 pt-6 shadow-[0px_3px_3px_-1.5px_rgba(0,0,0,0.06),0px_1px_1px_-0.5px_rgba(0,0,0,0.06),0px_0px_0px_1px_rgba(0,0,0,0.06)]">
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
                      <p className="text-sm text-muted-foreground">
                        No ideas yet. Let Dust suggest things to try.
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
                      <PreviouslyDoneRow
                        owner={owner}
                        podId={activationPodId}
                      />
                    </>
                  )}
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
                  key={prompt}
                  variant="outline"
                  size="sm"
                  isRounded
                  label={prompt}
                  onClick={() => void startConversation(prompt)}
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
