import { AppBuilderShell } from "@app/components/app/AppBuilderShell";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitMessage } from "@app/hooks/useSubmitMessage";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useCreateApp } from "@app/lib/swr/top_level_apps";
import { getAppRoute } from "@app/lib/utils/router";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { Button, Spinner, TextArea } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

/**
 * Prompt-first App creation: the App is created, its first prompt posted, and the user lands in the
 * builder with the agent already working. Nothing is persisted until the prompt is submitted, so
 * abandoning this page leaves no empty App behind.
 */
export function NewAppPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const router = useAppRouter();
  const sendNotification = useSendNotification();

  const createApp = useCreateApp({ owner });
  const submitMessage = useSubmitMessage({
    owner,
    user,
    conversationId: null,
  });

  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const onSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isCreating) {
      return;
    }

    setIsCreating(true);

    const app = await createApp();
    if (!app?.appConversationId) {
      setIsCreating(false);
      return;
    }

    const res = await submitMessage({
      input: trimmed,
      mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
      contentFragments: { uploaded: [], contentNodes: [] },
      conversationId: app.appConversationId,
    });

    if (res.isErr()) {
      sendNotification({
        type: "error",
        title: res.error.title,
        description: res.error.message,
      });
    }

    // The App exists either way, so land in the builder rather than stranding the user here.
    await router.push(getAppRoute(owner.sId, app.sId));
  }, [
    prompt,
    isCreating,
    createApp,
    submitMessage,
    sendNotification,
    router,
    owner.sId,
  ]);

  return (
    <AppBuilderShell owner={owner}>
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="flex w-full max-w-2xl flex-col items-center gap-6">
          <h1 className="heading-2xl text-center text-foreground dark:text-foreground-night">
            What do you want to build?
          </h1>
          {isCreating ? (
            <div className="flex flex-col items-center gap-3">
              <Spinner />
              <p className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
                Creating your App…
              </p>
            </div>
          ) : (
            <div className="flex w-full flex-col items-end gap-3">
              <TextArea
                placeholder="A todo list my team can share, with due dates…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSubmit();
                  }
                }}
                rows={4}
                autoFocus
              />
              <Button
                label="Build it"
                disabled={!prompt.trim()}
                onClick={() => void onSubmit()}
              />
            </div>
          )}
        </div>
      </div>
    </AppBuilderShell>
  );
}
