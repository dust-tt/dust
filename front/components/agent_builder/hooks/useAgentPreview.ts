import { isEqual } from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import {
  createConversationWithMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { useDebounce } from "@app/hooks/useDebounce";
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
  const { owner } = useAgentBuilderContext();
  const sendNotification = useSendNotification();
  const { getValues } = useFormContext<AgentBuilderFormData>();

  const lastFormDataRef = useRef<AgentBuilderFormData | null>(null);

  const [draftAgent, setDraftAgent] =
    useState<LightAgentConfigurationType | null>(null);
  const [isSavingDraftAgent, setIsSavingDraftAgent] = useState(false);
  const [draftCreationFailed, setDraftCreationFailed] = useState(false);
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);

  // We don't need to watch actions and instructions once we create the first version of draft agent,
  // since we will create a new version only when a user sends a chat.
  const actions = useWatch<AgentBuilderFormData, "actions">({
    name: "actions",
    disabled: !!draftAgent,
  });
  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
    disabled: !!draftAgent,
  });
  // We need to keep watching this since we will auto update the draft when name changes.
  const agentName = useWatch<AgentBuilderFormData, "agentSettings.name">({
    name: "agentSettings.name",
  });

  const {
    debouncedValue: debouncedInstructions,
    setValue: setDebouncedInstructions,
  } = useDebounce(instructions, {
    delay: 500,
  });
  const {
    debouncedValue: debouncedAgentName,
    setValue: setDebouncedAgentName,
  } = useDebounce(agentName, { delay: 300 });

  useEffect(() => {
    // show spinner already when a user starts typing
    setIsSavingDraftAgent(true);
    setDebouncedInstructions(instructions);
  }, [instructions, setDebouncedInstructions]);

  useEffect(() => {
    setDebouncedAgentName(agentName);
  }, [agentName, setDebouncedAgentName]);

  const createDraftAgent =
    useCallback(async (): Promise<LightAgentConfigurationType | null> => {
      setIsSavingDraftAgent(true);
      setDraftCreationFailed(false);

      const formData = getValues();
      lastFormDataRef.current = structuredClone(formData);

      const aRes = await submitAgentBuilderForm({
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

      setDraftAgent(aRes.value);
      setStickyMentions([{ configurationId: aRes.value.sId }]);
      setIsSavingDraftAgent(false);
      return aRes.value;
    }, [owner, sendNotification, getValues]);

  const getDraftAgent =
    useCallback(async (): Promise<LightAgentConfigurationType | null> => {
      const formData = getValues();
      if (
        lastFormDataRef.current &&
        isEqual(lastFormDataRef.current, formData)
      ) {
        return draftAgent;
      }

      return createDraftAgent();
    }, [draftAgent, createDraftAgent, getValues]);

  useEffect(() => {
    // Create the first version here, after that we will update the draft agent on form submission or name changes.
    if (!draftAgent) {
      const hasContent =
        (actions && actions.length > 0) || debouncedInstructions?.trim();

      if (hasContent) {
        void createDraftAgent();
      }

      return;
    }

    // If agent name is updated, we need to update the @mention in the input box,
    // so we will update the draft agent.
    if (
      lastFormDataRef.current &&
      lastFormDataRef.current?.agentSettings.name !== debouncedAgentName
    ) {
      void createDraftAgent();
    }

    setDraftCreationFailed(false);
  }, [
    actions,
    debouncedInstructions,
    debouncedAgentName,
    draftAgent,
    createDraftAgent,
    isSavingDraftAgent,
    getValues,
  ]);

  return {
    draftAgent,
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

  const { conversation: swrConversation } = useConversation({
    conversationId: conversationId || "",
    workspaceId: owner.sId,
    options: {
      disabled: !conversationId,
    },
  });

  const conversation = swrConversation || null;

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
      const currentAgent = await getDraftAgent();
      if (!currentAgent) {
        return new Err({
          code: "internal_error",
          name: "Draft Agent Creation Failed",
          message: "Failed to create draft agent before submitting message",
        });
      }

      // Update mentions in the message data to use the newly created draft agent
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
    setConversationId(newConversation?.sId || null);
  };

  return {
    conversation,
    setConversation,
    handleSubmit,
    resetConversation,
  };
}
