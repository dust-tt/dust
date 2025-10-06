import isEqual from "lodash/isEqual";
import { useCallback, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import {
  createConversationWithMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { useSendNotification } from "@app/hooks/useNotification";
import type { DustError } from "@app/lib/error";
import { useConversation } from "@app/lib/swr/conversations";
import { useUser } from "@app/lib/swr/user";
import type {
  AgentMention,
  ContentFragmentsType,
  ConversationType,
  LightAgentConfigurationType,
  MentionType,
  Result,
} from "@app/types";
import { Err, Ok } from "@app/types";

export function useDraftAgent() {
  const { owner, user } = useAgentBuilderContext();
  const sendNotification = useSendNotification();
  const { getValues } = useFormContext<AgentBuilderFormData>();

  const lastFormDataRef = useRef<AgentBuilderFormData | null>(null);

  const [draftAgent, setDraftAgent] =
    useState<LightAgentConfigurationType | null>(null);
  const [isSavingDraftAgent, setIsSavingDraftAgent] = useState(false);
  const [draftCreationFailed, setDraftCreationFailed] = useState(false);
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);

  const createDraftAgent =
    useCallback(async (): Promise<LightAgentConfigurationType | null> => {
      const formData = getValues();

      const hasContent =
        formData.instructions.trim() || formData.actions.length > 0;

      if (!hasContent) {
        setDraftCreationFailed(false);
        return null;
      }

      setIsSavingDraftAgent(true);
      setDraftCreationFailed(false);

      lastFormDataRef.current = structuredClone(formData);

      const aRes = await submitAgentBuilderForm({
        user,
        formData: {
          ...formData,
          agentSettings: {
            ...formData.agentSettings,
            name: formData.agentSettings.name || "Preview",
          },
        },
        owner,
        agentConfigurationId: null,
        isDraft: true,
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

      const newDraft = aRes.value;

      setDraftAgent(newDraft);
      setStickyMentions([{ configurationId: newDraft.sId }]);
      setIsSavingDraftAgent(false);
      return newDraft;
    }, [owner, user, sendNotification, getValues]);

  const getDraftAgent =
    useCallback(async (): Promise<LightAgentConfigurationType | null> => {
      const formData = getValues();

      if (
        lastFormDataRef.current &&
        isEqual(lastFormDataRef.current, formData) &&
        draftAgent
      ) {
        return draftAgent;
      }
      return createDraftAgent();
    }, [getValues, draftAgent, createDraftAgent]);

  return {
    draftAgent,
    setDraftAgent,
    createDraftAgent,
    isSavingDraftAgent,
    draftCreationFailed,
    getDraftAgent,
    stickyMentions,
    setStickyMentions,
  };
}

export function useDraftConversation({
  draftAgent,
  getDraftAgent,
}: {
  draftAgent: LightAgentConfigurationType | null;
  getDraftAgent: () => Promise<LightAgentConfigurationType | null>;
}) {
  const { owner } = useAgentBuilderContext();
  const { user } = useUser();
  const sendNotification = useSendNotification();

  const [conversationId, setConversationId] = useState<string | null>(null);

  const { conversation } = useConversation({
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    conversationId: conversationId || "",
    workspaceId: owner.sId,
    options: {
      disabled: !conversationId,
    },
  });

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

    try {
      // Ensure we have a current draft agent before submitting
      const currentAgent = await getDraftAgent();
      if (!currentAgent) {
        return new Err({
          code: "internal_error",
          name: "Draft Agent Creation Failed",
          message: "Failed to create draft agent before submitting message",
        });
      }

      // Update mentions in the message data to use the current draft agent
      mentions = mentions.map((mention) =>
        mention.configurationId === draftAgent?.sId && currentAgent?.sId
          ? { ...mention, configurationId: currentAgent.sId }
          : mention
      );
    } catch (error) {
      return new Err({
        code: "internal_error",
        name: "Draft Agent Creation Failed",
        message: "Failed to create draft agent before submitting message",
      });
    }

    const messageData = { input, mentions, contentFragments };

    if (!conversation) {
      const result = await createConversationWithMessage({
        owner,
        user,
        messageData,
        visibility: "test",
      });

      if (result.isOk()) {
        setConversationId(result.value.sId);
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

  const resetConversation = useCallback(() => {
    setConversation(null);
  }, []);

  const setConversation = (newConversation: ConversationType | null) => {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    setConversationId(newConversation?.sId || null);
  };

  return {
    conversation,
    setConversation,
    handleSubmit,
    resetConversation,
  };
}
