import isEqual from "lodash/isEqual";
import { useCallback, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import type { EditorMention } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { useSendNotification } from "@app/hooks/useNotification";
import type { DustError } from "@app/lib/error";
import { useUser } from "@app/lib/swr/user";
import type {
  ContentFragmentsType,
  ConversationType,
  LightAgentConfigurationType,
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

  const createConversation = useCallback(
    async (
      input: string,
      mentions: EditorMention[],
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
          mention.id === draftAgent?.sId && currentAgent?.sId
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

      const messageData = {
        input,
        mentions: mentions.map((mention) => ({
          configurationId: mention.id,
        })),
        contentFragments,
      };

      const result = await createConversationWithMessage({
        owner,
        user,
        messageData,
        visibility: "test",
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
    },
    [draftAgent?.sId, getDraftAgent, owner, sendNotification, user]
  );

  const resetConversation = useCallback(() => {
    setConversation(null);
  }, [setConversation]);

  return {
    conversation,
    createConversation,
    resetConversation,
  };
}
