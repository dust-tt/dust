import { useSendNotification } from "@dust-tt/sparkle";
import { isEqual } from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import {
  createConversationWithMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { useMCPServerViewsContext } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { useDebounce } from "@app/hooks/useDebounce";
import type { DustError } from "@app/lib/error";
import type {
  AgentMention,
  ContentFragmentsType,
  ConversationType,
  LightAgentConfigurationType,
  MentionType,
  Result,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Err, Ok } from "@app/types";

export function usePreviewAgent() {
  const { owner } = useAgentBuilderContext();
  const { mcpServerViews } = useMCPServerViewsContext();

  const form = useFormContext<AgentBuilderFormData>();
  const formData = form.watch();

  const [draftAgent, setDraftAgent] =
    useState<LightAgentConfigurationType | null>(null);
  const [isSavingDraftAgent, setIsSavingDraftAgent] = useState(false);
  const [draftCreationFailed, setDraftCreationFailed] = useState(false);

  const sendNotification = useSendNotification();
  const lastFormDataRef = useRef<AgentBuilderFormData>(formData);
  const lastDebouncedNameRef = useRef<string>(
    formData.agentSettings.name || ""
  );

  const { debouncedValue: debouncedAgentName, setValue: setAgentNameValue } =
    useDebounce(formData.agentSettings.name || "", {
      delay: 1000,
    });

  useEffect(() => {
    setAgentNameValue(formData.agentSettings.name || "");
  }, [formData.agentSettings.name, setAgentNameValue]);

  const hasContent =
    formData.instructions?.trim() || formData.actions.length > 0;

  const createDraftAgentWithName = useCallback(
    async (
      overrideName?: string
    ): Promise<LightAgentConfigurationType | null> => {
      setIsSavingDraftAgent(true);
      setDraftCreationFailed(false);

      const aRes = await submitAgentBuilderForm({
        formData: {
          ...formData,
          agentSettings: {
            ...formData.agentSettings,
            name: overrideName || formData.agentSettings.name || "Draft Agent",
            description:
              formData.agentSettings.description || "Draft Agent for Testing",
            pictureUrl:
              formData.agentSettings.pictureUrl ||
              "https://dust.tt/static/assistants/logo.svg",
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
      setIsSavingDraftAgent(false);
      return aRes.value;
    },
    [owner, mcpServerViews, sendNotification, formData]
  );

  const createDraftAgent =
    useCallback(async (): Promise<LightAgentConfigurationType | null> => {
      // Always create a new draft if form data has changed
      if (!isEqual(lastFormDataRef.current, formData)) {
        // Form data has changed, we need to create a new draft
      } else if (draftAgent) {
        // Form data hasn't changed and we have a draft, return existing
        return draftAgent;
      }

      const result = await createDraftAgentWithName();
      if (result) {
        lastFormDataRef.current = formData;
      }
      return result;
    }, [formData, draftAgent, createDraftAgentWithName]);

  useEffect(() => {
    const createDraftAgentIfNeeded = async () => {
      if (
        hasContent &&
        !draftAgent &&
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
    hasContent,
    draftAgent,
    isSavingDraftAgent,
    draftCreationFailed,
    createDraftAgent,
  ]);

  useEffect(() => {
    if (!isEqual(lastFormDataRef.current, formData)) {
      setDraftCreationFailed(false);
    }
  }, [formData]);

  // Debounced draft creation for agent name changes
  useEffect(() => {
    const previousName = lastDebouncedNameRef.current;
    const currentName = debouncedAgentName;

    // Only trigger debounced creation if name changed and we have content
    if (previousName !== currentName && currentName?.trim() && hasContent) {
      const createDraftWithDebouncedName = async () => {
        const result = await createDraftAgentWithName(currentName);
        if (result) {
          lastDebouncedNameRef.current = currentName;
        }
      };

      void createDraftWithDebouncedName();
    }
  }, [debouncedAgentName, hasContent, createDraftAgentWithName]);

  return {
    draftAgent,
    isSavingDraftAgent,
    createDraftAgent,
  };
}

export function useTryAgentCore({
  owner,
  user,
  agent,
  createDraftAgent,
}: {
  owner: WorkspaceType;
  user: UserType | null;
  agent: LightAgentConfigurationType | null;
  createDraftAgent?: () => Promise<LightAgentConfigurationType | null>;
}) {
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>(
    agent?.sId ? [{ configurationId: agent.sId }] : []
  );
  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );
  const sendNotification = useSendNotification();

  const conversationTitle = `Trying @${agent?.name || "your agent"}`;

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
    let currentAgent = agent;
    if (createDraftAgent) {
      try {
        currentAgent = await createDraftAgent();
        if (!currentAgent) {
          return new Err({
            code: "internal_error",
            name: "Draft Agent Creation Failed",
            message: "Failed to create draft agent before submitting message",
          });
        }

        // Update sticky mentions with the newly created draft agent
        setStickyMentions([{ configurationId: currentAgent.sId }]);

        // Update mentions in the message data to use the newly created draft agent
        const updatedMentions = mentions.map((mention) =>
          mention.configurationId === agent?.sId && currentAgent?.sId
            ? { ...mention, configurationId: currentAgent.sId }
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

  useEffect(() => {
    setStickyMentions(agent?.sId ? [{ configurationId: agent.sId }] : []);
  }, [agent]);

  return {
    stickyMentions,
    setStickyMentions,
    conversation,
    setConversation,
    handleSubmit,
  };
}
