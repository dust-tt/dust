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
    useState<LightAgentConfigurationType | null>();
  const [isFading, setIsFading] = useState(false);
  const [isSavingDraftAgent, setIsSavingDraftAgent] = useState(true);
  const drawerAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sendNotification = useSendNotification();

  const previousBuilderState = useRef<AssistantBuilderState>(builderState);
  const [hasChanged, setHasChanged] = useState(false);
  const initialCreationAttempted = useRef(false);

  const animate = () => {
    if (drawerAnimationTimeoutRef.current) {
      clearTimeout(drawerAnimationTimeoutRef.current);
      drawerAnimationTimeoutRef.current = null;
    }
    setIsFading(true);
    drawerAnimationTimeoutRef.current = setTimeout(() => {
      setIsFading(false);
    }, animationLength);
  };

  useEffect(() => {
    if (!isEqual(previousBuilderState.current, builderState)) {
      setHasChanged(true);
      previousBuilderState.current = builderState;
    }
  }, [builderState]);

  const createDraftAgent = useCallback(async () => {
    if (draftAssistant && !hasChanged) {
      return draftAssistant;
    }

    setIsSavingDraftAgent(true);

    const aRes = await submitAssistantBuilderForm({
      owner,
      builderState: {
        handle: builderState.handle,
        description: "Draft Agent",
        instructions: builderState.instructions,
        avatarUrl: builderState.avatarUrl ?? getDefaultAvatarUrlForPreview(),
        scope: "hidden",
        generationSettings: builderState.generationSettings,
        actions: builderState.actions,
        maxStepsPerRun: builderState.maxStepsPerRun,
        visualizationEnabled: builderState.visualizationEnabled,
        templateId: builderState.templateId,
        tags: builderState.tags,
        editors: builderState.editors,
      },
      agentConfigurationId: null,
      slackData: {
        selectedSlackChannels: [],
        slackChannelsLinkedWithAgent: [],
      },
      isDraft: true,
      reasoningModels,
    });

    setIsSavingDraftAgent(false);

    if (!aRes.isOk()) {
      sendNotification({
        title: "Error saving Draft Agent",
        description: aRes.error.message,
        type: "error",
      });
      throw new Error(aRes.error.message);
    }

    animate();
    setDraftAssistant(aRes.value);
    setHasChanged(false);

    return aRes.value;
  }, [
    draftAssistant,
    hasChanged,
    owner,
    builderState.handle,
    builderState.instructions,
    builderState.avatarUrl,
    builderState.generationSettings,
    builderState.actions,
    builderState.editors,
    builderState.maxStepsPerRun,
    builderState.templateId,
    builderState.visualizationEnabled,
    builderState.tags,
    reasoningModels,
    sendNotification,
  ]);

  useEffect(() => {
    const hasContent =
      builderState.instructions?.trim() || builderState.actions.length > 0;
    if (hasContent && !initialCreationAttempted.current) {
      initialCreationAttempted.current = true;
      createDraftAgent().catch(console.error);
    } else if (!hasContent && !initialCreationAttempted.current) {
      setIsSavingDraftAgent(false);
    }
  }, [
    builderState.actions.length,
    builderState.instructions,
    createDraftAgent,
  ]);

  useEffect(() => {
    return () => {
      if (drawerAnimationTimeoutRef.current) {
        clearTimeout(drawerAnimationTimeoutRef.current);
      }
    };
  }, []);

  return {
    isFading,
    draftAssistant: draftAssistant ?? null,
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
  createDraftAgent?: () => Promise<LightAgentConfigurationType>;
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
