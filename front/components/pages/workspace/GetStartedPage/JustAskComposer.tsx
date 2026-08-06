import { FilePreviewProvider } from "@app/components/assistant/conversation/FilePreviewContext";
import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import {
  InputBarContext,
  InputBarProvider,
} from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import type { DustError } from "@app/lib/error";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { RichMention } from "@app/types/assistant/mentions";
import { toMentionType } from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { useCallback, useContext } from "react";

// One-tap starters under "Or just ask" — activation-oriented, phrased as things
// the user can ask their learning space to do.
const ASK_SUGGESTIONS = [
  "Scan my connected sources for repetitive work I can automate",
  "Ask me questions to learn how I work",
  "How does my learning space work?",
];

interface JustAskComposerProps {
  owner: WorkspaceType;
  user: UserType | null;
  podId: string | null;
  defaultAgentId: string | null;
}

export function JustAskComposer({
  owner,
  user,
  podId,
  defaultAgentId,
}: JustAskComposerProps) {
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const startConversation = useCallback(
    async (
      input: string,
      mentions: RichMention[],
      contentFragments: ContentFragmentsType,
      selectedMCPServerViewIds?: string[],
      selectedSpaceIds?: string[],
      modelSelection?: ModelSelectionType
    ): Promise<Result<undefined, DustError>> => {
      const res = await createConversationWithMessage({
        messageData: {
          input,
          mentions: mentions.map(toMentionType),
          contentFragments,
          selectedMCPServerViewIds,
          richMentions: mentions,
          modelSelection,
        },
        spaceId: podId,
        deferMessage: true,
      });

      if (res.isErr()) {
        sendNotification({
          type: "error",
          title: "Couldn't start the conversation",
          description: res.error.message,
        });
        return new Err({
          code: "internal_error",
          name: res.error.title,
          message: res.error.message,
        });
      }

      await router.push(
        getConversationRoute(owner.sId, res.value.sId),
        undefined,
        { shallow: true }
      );
      return new Ok(undefined);
    },
    [createConversationWithMessage, sendNotification, router, owner.sId, podId]
  );

  return (
    <InputBarProvider>
      <FilePreviewProvider owner={owner}>
        <FileDropProvider>
          <GenerationContextProvider>
            {/* Chips live inside the InputBarProvider so they can prefill the
                composer below via shared context. */}
            <AskChips />
            <div className="mt-4">
              <InputBar
                owner={owner}
                user={user}
                onSubmit={startConversation}
                draftKey="get-started-new-conversation"
                disableAutoFocus
                defaultAgentId={defaultAgentId}
                placeholder="Ask your agents anything, or describe a task…"
              />
            </div>
          </GenerationContextProvider>
        </FileDropProvider>
      </FilePreviewProvider>
    </InputBarProvider>
  );
}

function AskChips() {
  const { setPendingInputText } = useContext(InputBarContext);
  return (
    <div className="flex flex-wrap gap-2">
      {ASK_SUGGESTIONS.map((suggestion) => (
        <Button
          key={suggestion}
          variant="outline"
          size="sm"
          isRounded
          label={suggestion}
          onClick={() => setPendingInputText(suggestion, { replace: true })}
        />
      ))}
    </div>
  );
}
