import { useSendNotification } from "@dust-tt/sparkle";
import { isEqual } from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createConversationWithMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { getDefaultAvatarUrlForPreview } from "@app/components/assistant_builder/avatar_picker/utils";
import { submitAssistantBuilderForm } from "@app/components/assistant_builder/submitAssistantBuilderForm";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import type { DustError } from "@app/lib/error";
import type {
  AgentMention,
  ContentFragmentsType,
  ConversationType,
  LightAgentConfigurationType,
  MentionType,
  ModelConfigurationType,
  Result,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Err, Ok } from "@app/types";

interface UsePreviewAssistantProps {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  reasoningModels: ModelConfigurationType[];
}

export function usePreviewAssistant({
  owner,
  builderState,
  reasoningModels,
}: UsePreviewAssistantProps) {
  const animationLength = 1000;
  const [draftAssistant, setDraftAssistant] =
    useState<LightAgentConfigurationType | null>(null);
  const [isFading, setIsFading] = useState(false);
  const [isSavingDraftAgent, setIsSavingDraftAgent] = useState(false);
  const [draftCreationFailed, setDraftCreationFailed] = useState(false);

  const drawerAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sendNotification = useSendNotification();
  const lastBuilderStateRef = useRef<AssistantBuilderState>(builderState);

  const animate = useCallback(() => {
    if (drawerAnimationTimeoutRef.current) {
      clearTimeout(drawerAnimationTimeoutRef.current);
      drawerAnimationTimeoutRef.current = null;
    }
    setIsFading(true);
    drawerAnimationTimeoutRef.current = setTimeout(() => {
      setIsFading(false);
    }, animationLength);
  }, [animationLength]);

  const createDraftAgent =
    useCallback(async (): Promise<LightAgentConfigurationType | null> => {
      if (
        draftAssistant &&
        isEqual(lastBuilderStateRef.current, builderState)
      ) {
        return draftAssistant;
      }

      setIsSavingDraftAgent(true);
      setDraftCreationFailed(false);

      const aRes = await submitAssistantBuilderForm({
        owner,
        builderState: {
          ...builderState,
          description: "Draft Agent",
          avatarUrl: builderState.avatarUrl ?? getDefaultAvatarUrlForPreview(),
          scope: "hidden",
        },
        agentConfigurationId: null,
        slackData: {
          selectedSlackChannels: [],
          slackChannelsLinkedWithAgent: [],
        },
        isDraft: true,
        reasoningModels,
      });

      if (!aRes.isOk()) {
        sendNotification({
          title: "Error saving Draft Agent",
          description: aRes.error.message,
          type: "error",
        });
        setIsSavingDraftAgent(false);
        setDraftCreationFailed(true);
        return null;
      }

      animate();
      setDraftAssistant(aRes.value);
      lastBuilderStateRef.current = builderState;
      setIsSavingDraftAgent(false);

      return aRes.value;
    }, [
      draftAssistant,
      owner,
      builderState,
      reasoningModels,
      sendNotification,
      animate,
    ]);

  useEffect(() => {
    const createDraftAgentIfNeeded = async () => {
      const hasContent =
        builderState.instructions?.trim() || builderState.actions.length > 0;

      if (
        hasContent &&
        !draftAssistant &&
        !isSavingDraftAgent &&
        !draftCreationFailed
      ) {
        await createDraftAgent();
      } else if (!hasContent) {
        setIsSavingDraftAgent(false);
        setDraftCreationFailed(false);
      }
    };

    void createDraftAgentIfNeeded();
  }, [
    builderState.instructions,
    builderState.actions.length,
    draftAssistant,
    isSavingDraftAgent,
    draftCreationFailed,
    createDraftAgent,
  ]);

  useEffect(() => {
    if (!isEqual(lastBuilderStateRef.current, builderState)) {
      setDraftCreationFailed(false);
    }
  }, [builderState]);

  useEffect(() => {
    return () => {
      if (drawerAnimationTimeoutRef.current) {
        clearTimeout(drawerAnimationTimeoutRef.current);
      }
    };
  }, []);

  return {
    isFading,
    draftAssistant,
    isSavingDraftAgent,
    createDraftAgent,
  };
}

export function useTryAssistantCore({
  owner,
  user,
  assistant,
  openWithConversation,
  createDraftAgent,
}: {
  owner: WorkspaceType;
  user: UserType | null;
  openWithConversation?: ConversationType;
  assistant: LightAgentConfigurationType | null;
  createDraftAgent?: () => Promise<LightAgentConfigurationType | null>;
}) {
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([
    { configurationId: assistant?.sId as string },
  ]);
  const [conversation, setConversation] = useState<ConversationType | null>(
    openWithConversation ?? null
  );
  const sendNotification = useSendNotification();

  const handleSubmit = async (
    input: string,
    mentions: MentionType[],
    contentFragments: ContentFragmentsType
  ): Promise<Result<undefined, DustError>> => {
    if (!user) {
      return new Err({
        code: "internal_error",
        name: "No user",
        message: "No user found",
      });
    }

    // Create or update draft agent before submitting message if createDraftAgent is provided
    let currentAssistant = assistant;
    if (createDraftAgent) {
      try {
        currentAssistant = await createDraftAgent();
        if (!currentAssistant) {
          return new Err({
            code: "internal_error",
            name: "Draft Agent Creation Failed",
            message: "Failed to create draft agent before submitting message",
          });
        }

        // Update sticky mentions with the newly created draft agent
        setStickyMentions([{ configurationId: currentAssistant.sId }]);

        // Update mentions in the message data to use the newly created draft agent
        const updatedMentions = mentions.map((mention) =>
          mention.configurationId === assistant?.sId
            ? { ...mention, configurationId: currentAssistant?.sId as string }
            : mention
        );
        mentions = updatedMentions;
      } catch (error) {
        return new Err({
          code: "internal_error",
          name: "Draft Agent Creation Failed",
          message: "Failed to create draft agent before submitting message",
        });
      }
    }

    const messageData = { input, mentions, contentFragments };
    if (!conversation) {
      const result = await createConversationWithMessage({
        owner,
        user,
        messageData,
        visibility: "test",
        title: `Trying @${currentAssistant?.name}`,
      });
      if (result.isOk()) {
        setConversation(result.value);
        return new Ok(undefined);
      }
      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
      });
      return new Err({
        code: "internal_error",
        name: result.error.title,
        message: result.error.message,
      });
    } else {
      const result = await submitMessage({
        owner,
        user,
        conversationId: conversation.sId as string,
        messageData,
      });
      if (result.isOk()) {
        return new Ok(undefined);
      }
      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
      });

      return new Err({
        code: "internal_error",
        name: result.error.title,
        message: result.error.message,
      });
    }
  };

  useEffect(() => {
    setStickyMentions([{ configurationId: assistant?.sId as string }]);
  }, [assistant]);

  return {
    stickyMentions,
    setStickyMentions,
    conversation,
    setConversation,
    handleSubmit,
  };
}
