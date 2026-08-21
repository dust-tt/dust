import { ActivationPodContent } from "@app/components/activation/ActivationPodContent";
import { ActivationSurface } from "@app/components/activation/ActivationSurface";
import { JustAskComposer } from "@app/components/activation/JustAskComposer";
import { RecentConversations } from "@app/components/activation/RecentConversations";
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
        <ActivationPodContent
          owner={owner}
          user={user}
          podId={activationPodId}
          defaultAgentId={defaultAgentId}
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
