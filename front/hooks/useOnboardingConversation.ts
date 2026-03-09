import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import type { PostSendOnboardingResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/send-onboarding";
import { useCallback, useEffect, useRef } from "react";

interface UseOnboardingConversationProps {
  workspaceId: string;
  conversationId: string | null;
}

export function useOnboardingConversation({
  workspaceId,
  conversationId,
}: UseOnboardingConversationProps) {
  const router = useAppRouter();
  const welcome = useSearchParam("welcome");
  const isCreatingRef = useRef(false);

  const createOnboardingConversation = useCallback(async () => {
    if (isCreatingRef.current) {
      return;
    }
    isCreatingRef.current = true;

    const language =
      typeof navigator !== "undefined"
        ? (navigator.language?.split("-")[0] ?? null)
        : null;

    const res = await clientFetch(
      `/api/w/${workspaceId}/assistant/conversations/send-onboarding`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ language }),
      }
    );

    if (res.ok) {
      const data = (await res.json()) as PostSendOnboardingResponseBody;
      if (data.conversationSId) {
        await router.replace(
          `/w/${workspaceId}/conversation/${data.conversationSId}`
        );
        return;
      }
    }

    // If no conversation was created or there was an error, remove the welcome param
    const currentPath = router.asPath.replace(/[?&]welcome=true/, "");
    await router.replace(currentPath);
    isCreatingRef.current = false;
  }, [workspaceId, router]);

  useEffect(() => {
    const shouldCreateOnboarding =
      welcome === "true" && conversationId === null;

    if (shouldCreateOnboarding) {
      void createOnboardingConversation();
    }
  }, [welcome, conversationId, createOnboardingConversation]);
}
