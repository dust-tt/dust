import { debounce, isEqual } from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import {
  createConversationWithMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { useMCPServerViewsContext } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { useSendNotification } from "@app/hooks/useNotification";
import type { DustError } from "@app/lib/error";
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
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();
  const sendNotification = useSendNotification();
  const { getValues } = useFormContext<AgentBuilderFormData>();

  const formData = useWatch<AgentBuilderFormData>();
  const lastFormDataRef = useRef<AgentBuilderFormData | null>(null);

  const [draftAgent, setDraftAgent] =
    useState<LightAgentConfigurationType | null>(null);
  const [isSavingDraftAgent, setIsSavingDraftAgent] = useState(false);
  const [draftCreationFailed, setDraftCreationFailed] = useState(false);
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);

  const createDraftAgent =
    useCallback(async (): Promise<LightAgentConfigurationType | null> => {
      // Don't create draft if MCP server views are still loading
      if (isMCPServerViewsLoading) {
        return null;
      }

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
        mcpServerViews,
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
    }, [
      owner,
      mcpServerViews,
      sendNotification,
      isMCPServerViewsLoading,
      getValues,
    ]);

  const debouncedCreateDraftAgent = useCallback(
    debounce(() => {
      void createDraftAgent();
    }, 500),
    []
  );

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
    return () => {
      debouncedCreateDraftAgent.cancel();
    };
  }, [debouncedCreateDraftAgent]);

  useEffect(() => {
    if (isMCPServerViewsLoading) {
      return;
    }

    // Create the first version here, after that we will update the draft agent on form submission.
    if (!draftAgent) {
      const hasContent =
        (formData.actions && formData.actions.length > 0) ||
        formData.instructions?.trim();

      if (!isSavingDraftAgent && hasContent) {
        void debouncedCreateDraftAgent();
      }

      return;
    }

    // If agent name is updated, we need to update the @mention in the input box,
    // so we will update the draft agent.
    if (
      lastFormDataRef.current &&
      lastFormDataRef.current?.agentSettings.name !==
        formData.agentSettings?.name
    ) {
      void debouncedCreateDraftAgent();
    }

    setDraftCreationFailed(false);
  }, [
    formData,
    draftAgent,
    debouncedCreateDraftAgent,
    isMCPServerViewsLoading,
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

  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );

  const conversationTitle = `Trying @${draftAgent?.name || "your agent"}`;

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
        title: conversationTitle,
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

  return {
    conversation,
    setConversation,
    handleSubmit,
  };
}
