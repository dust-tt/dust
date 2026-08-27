import { ActivationSurface } from "@app/components/activation/ActivationSurface";
import { JustAskComposer } from "@app/components/activation/JustAskComposer";
import { RecentConversations } from "@app/components/activation/RecentConversations";
import type { RecommendationSectionCopy } from "@app/components/activation/RecommendationSection";
import { RecommendationSection } from "@app/components/activation/RecommendationSection";
import type {
  WorkAreaSectionAction,
  WorkAreaSectionCopy,
} from "@app/components/activation/WorkAreaSection";
import { WorkAreaSection } from "@app/components/activation/WorkAreaSection";
import { AssistantLayout } from "@app/components/assistant/AssistantLayout";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useActivationPod } from "@app/lib/swr/activation";
import { usePodMetadata } from "@app/lib/swr/pods";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import { FOR_YOU_EMAIL_UTM } from "@app/lib/tracking/campaigns";
import { getConversationRoute } from "@app/lib/utils/router";
import { resolveDefaultAgentId } from "@app/types/user";
import { Button, Spinner } from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

const LEARNING_WORK_AREA_COPY: WorkAreaSectionCopy = {
  title: "Your work",
  description: "What you care about at work. Ideas below are based on this.",
  emptyState: "We don't know what you care about yet.",
  actionDescription:
    "Select an option below to give us feedback. We'll update this and suggest a new idea.",
  runningBanner: "An agent is actively learning about your work.",
};

const LEARNING_WORK_AREA_ACTIONS: readonly WorkAreaSectionAction[] = [
  {
    label: "Scan my sources",
    message:
      "This conversation is to update my work areas, then generate a new idea.\n\n" +
      "1. Re-evaluate my work by scanning my connected sources and personal usage.\n" +
      "2. Present the updated work areas and let me correct them if they're off.\n" +
      "3. Once the work areas are settled, continue the regular flow: set a session goal from the updated work areas and generate a new recommendation (create_recommendation) so it appears on my Get Started page.\n\n" +
      "Do not generate a recommendation until the work areas are settled.",
  },
  {
    label: "Ask me questions",
    message:
      "This conversation is to update my work areas, then generate a new idea.\n\n" +
      "1. Learn more about my work by asking me questions, interview style. Do this before generating a recommendation.\n" +
      "2. Update my work areas based on what I tell you, and let me correct them if they're off.\n" +
      "3. Once the work areas are settled, continue the regular flow: set a session goal from the updated work areas and generate a new recommendation (create_recommendation) so it appears on my Get Started page.\n\n" +
      "Do not generate a recommendation until the work areas are settled.",
  },
];

const LEARNING_RECOMMENDATION_COPY: RecommendationSectionCopy = {
  title: "Ideas for right now",
  description:
    "These change as you work. New ones surface as your context shifts.",
  emptyState: "No new ideas yet. Let Dust suggest things to try.",
  generateLabel: "Generate a new idea for me",
  runningBanner: "An agent is actively looking for ideas for you.",
};

const QUICK_PROMPTS = [
  {
    label: "What skills and agents are my coworkers using?",
    message:
      "What skills and agents are my coworkers using? Show me what's catching on in this workspace and whether any of it would help my work.",
  },
  {
    label: "What's coming up that I should prep for?",
    message:
      "Look at my calendar and recent work. What's coming up that I should prep for, and how can Dust help?",
  },
  {
    label: "How are people in my role using Dust?",
    message:
      "How are people in the same role as me using Dust? Show me the skills and agents they actually use, and which of those would help my work.",
  },
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromEmail =
      params.get("utm_campaign") === FOR_YOU_EMAIL_UTM.utm_campaign;
    const conversationId = fromEmail ? params.get("utm_content") : null;
    trackEvent({
      area: TRACKING_AREAS.WORKSPACE,
      object: "for_you_page",
      action: TRACKING_ACTIONS.OPEN,
      extra: {
        user_id: user.sId,
        from_email: fromEmail,
        ...(conversationId ? { conversation_id: conversationId } : {}),
      },
    });
  }, [user.sId]);

  // The whole surface is scoped to the user's activation Pod, so without one
  // there is nothing to show. Redirect to the workspace home once the Pod
  // check resolves rather than rendering an empty page.
  useEffect(() => {
    if (!isActivationPodLoading && activationPodId === null) {
      void router.replace(getConversationRoute(owner.sId));
    }
  }, [isActivationPodLoading, activationPodId, owner.sId, router]);

  // Hold on a spinner while the Pod check is in flight or while the redirect
  // above is taking effect, so the page never flashes for a Pod-less user.
  if (isActivationPodLoading || activationPodId === null) {
    return (
      <AssistantLayout owner={owner} user={user}>
        <div className="flex min-h-full w-full items-center justify-center">
          <Spinner size="md" />
        </div>
      </AssistantLayout>
    );
  }

  return (
    <AssistantLayout owner={owner} user={user}>
      <ActivationSurface
        highlightedTitle="This is your learning space"
        description={
          <>
            Your own corner of Dust, where your agents and connected tools come
            together.
            <br />
            Nothing here is a demo. It is already wired to how your team works,
            and it is waiting for you.
          </>
        }
      >
        <WorkAreaSection
          owner={owner}
          user={user}
          podId={activationPodId}
          defaultAgentId={defaultAgentId}
          copy={LEARNING_WORK_AREA_COPY}
          actions={LEARNING_WORK_AREA_ACTIONS}
        />
        <RecommendationSection
          owner={owner}
          podId={activationPodId}
          copy={LEARNING_RECOMMENDATION_COPY}
          isGenerating={isGeneratingIdea}
          onGenerate={() => void generateIdea()}
        />
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
      </ActivationSurface>
    </AssistantLayout>
  );
}
