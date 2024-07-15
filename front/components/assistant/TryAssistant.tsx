import type { WorkspaceType } from "@dust-tt/types";
import type {
  AgentMention,
  ConversationType,
  LightAgentConfigurationType,
  MentionType,
  UserType,
} from "@dust-tt/types";
import type { UploadedContentFragment } from "@dust-tt/types";
import { isEqual } from "lodash";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createConversationWithMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { getDefaultAvatarUrlForPreview } from "@app/components/assistant_builder/avatar_picker/utils";
import { submitAssistantBuilderForm } from "@app/components/assistant_builder/submitAssistantBuilderForm";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { debounce } from "@app/lib/utils/debounce";

export function usePreviewAssistant({
  owner,
  builderState,
  isPreviewOpened,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  isPreviewOpened: boolean;
}): {
  shouldAnimate: boolean;
  isFading: boolean; // Add isFading to the return type
  draftAssistant: LightAgentConfigurationType | null;
} {
  const animationLength = 1000;
  const [draftAssistant, setDraftAssistant] =
    useState<LightAgentConfigurationType | null>();
  const [animateDrawer, setAnimateDrawer] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const drawerAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);
  const sendNotification = React.useContext(SendNotificationsContext);

  // Some state to keep track of the previous builderState
  const previousBuilderState = useRef<AssistantBuilderState>(builderState);
  const [hasChanged, setHasChanged] = useState(false);

  const animate = () => {
    if (drawerAnimationTimeoutRef.current) {
      clearTimeout(drawerAnimationTimeoutRef.current);
      drawerAnimationTimeoutRef.current = null;
    }
    setAnimateDrawer(true);
    setIsFading(true); // Start fading conversation
    drawerAnimationTimeoutRef.current = setTimeout(() => {
      setAnimateDrawer(false);
      setIsFading(false); // Stop fading
    }, animationLength);
  };

  useEffect(() => {
    if (!isEqual(previousBuilderState.current, builderState)) {
      setHasChanged(true);
      previousBuilderState.current = builderState;
    }
  }, [builderState]);

  const submit = useCallback(async () => {
    if (!isPreviewOpened) {
      // Preview is not opened, no need to submit
      return;
    }
    if (draftAssistant && !hasChanged) {
      // No changes since the last submission
      return;
    }

    const aRes = await submitAssistantBuilderForm({
      owner,
      builderState: {
        handle: builderState.handle,
        description: "Draft Assistant",
        instructions: builderState.instructions,
        avatarUrl: builderState.avatarUrl ?? getDefaultAvatarUrlForPreview(),
        scope: "private",
        generationSettings: builderState.generationSettings,
        actions: builderState.actions,
        maxStepsPerRun: builderState.maxStepsPerRun,
        templateId: builderState.templateId,
      },
      agentConfigurationId: null,
      slackData: {
        selectedSlackChannels: [],
        slackChannelsLinkedWithAgent: [],
      },
      isDraft: true,
    });

    if (!aRes.isOk()) {
      sendNotification({
        title: "Error saving Draft Assistant",
        description: aRes.error.message,
        type: "error",
      });
      return;
    }

    animate();

    // Use setTimeout to delay the execution of setDraftAssistant by 500 milliseconds
    setTimeout(() => {
      setDraftAssistant(aRes.value);
      setHasChanged(false);
    }, animationLength / 2);
  }, [
    isPreviewOpened,
    draftAssistant,
    hasChanged,
    owner,
    builderState.handle,
    builderState.instructions,
    builderState.avatarUrl,
    builderState.generationSettings,
    builderState.actions,
    builderState.maxStepsPerRun,
    builderState.templateId,
    sendNotification,
  ]);

  useEffect(() => {
    debounce(debounceHandle, submit, 1500);
  }, [submit]);

  return {
    shouldAnimate: animateDrawer,
    isFading,
    draftAssistant: draftAssistant ?? null,
  };
}

export function useTryAssistantCore({
  owner,
  user,
  assistant,
  openWithConversation,
}: {
  owner: WorkspaceType;
  user: UserType | null;
  openWithConversation?: ConversationType;
  assistant: LightAgentConfigurationType | null;
}) {
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([
    { configurationId: assistant?.sId as string },
  ]);
  const [conversation, setConversation] = useState<ConversationType | null>(
    openWithConversation ?? null
  );
  const sendNotification = useContext(SendNotificationsContext);

  const handleSubmit = async (
    input: string,
    mentions: MentionType[],
    contentFragments: UploadedContentFragment[]
  ) => {
    if (!user) {
      return;
    }
    const messageData = { input, mentions, contentFragments };
    if (!conversation) {
      const result = await createConversationWithMessage({
        owner,
        user,
        messageData,
        visibility: "test",
        title: `Trying @${assistant?.name}`,
      });
      if (result.isOk()) {
        setConversation(result.value);
        return;
      }
      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
      });
    } else {
      const result = await submitMessage({
        owner,
        user,
        conversationId: conversation.sId as string,
        messageData,
      });
      if (result.isOk()) {
        return;
      }
      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
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
