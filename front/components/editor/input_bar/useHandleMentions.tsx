import {
  InputBarContext,
  type PendingInputText,
} from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { EditorService } from "@app/components/editor/input_bar/useCustomEditor";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";
import {
  isRichAgentMention,
  toRichAgentMentionType,
} from "@app/types/assistant/mentions";
import { useContext, useEffect, useRef } from "react";

interface UseHandleMentionsOptions {
  allAgents: LightAgentConfigurationType[];
  conversation?: ConversationWithoutContentType;
  disableAutoFocus: boolean;
  editorService: EditorService;
  getDraft: () => {
    text: string;
    agentMention?: RichAgentMention | null;
  } | null;
  // The user's personal default agent for new conversations (sId), or null when unset.
  // Resolved against `allAgents`, falling back to @dust.
  defaultAgentId?: string | null;
  // While true, the personal default is still loading; we hold off on committing a
  // new-conversation default so we don't pick @dust first and then visibly swap.
  isDefaultAgentLoading?: boolean;
  isAgentBuilder: boolean;
  pendingInputText?: PendingInputText | null;
  selectedAgent: RichAgentMention | null;
  stickyMentions?: RichMention[];
}

const useHandleMentions = ({
  allAgents,
  conversation,
  editorService,
  getDraft,
  defaultAgentId,
  isDefaultAgentLoading,
  isAgentBuilder,
  pendingInputText,
  selectedAgent,
  stickyMentions,
}: UseHandleMentionsOptions) => {
  const stickyMentionsTextContent = useRef<string | null>(null);
  const { setSelectedSingleAgent } = useContext(InputBarContext);

  // Priority: draft > sticky mentions > @dust fallback.
  // Also resets when the conversation changes so stale state doesn't leak.
  const prevConversationIdRef = useRef(conversation?.sId ?? null);

  // Tracks when an agent has been explicitly set via the URL ?agent= param.
  // When set, the priority resolution effect must not override it with
  // stickyMentions or the @Dust fallback.
  const externalAgentSetRef = useRef(false);

  useEffect(() => {
    const currentId = conversation?.sId ?? null;
    if (currentId !== prevConversationIdRef.current) {
      prevConversationIdRef.current = currentId;
      externalAgentSetRef.current = false;
      setSelectedSingleAgent(null);
    }

    // An external source (URL param) already set the agent — do not override.
    if (externalAgentSetRef.current) {
      return;
    }

    // Agent builder: wait for the draft agent to arrive via stickyMentions.
    // Clear any stale selectedSingleAgent from the previous page while waiting,
    // so the old agent doesn't flash in the input bar.
    if (isAgentBuilder && (!stickyMentions || stickyMentions.length === 0)) {
      setSelectedSingleAgent(null);
      return;
    }

    // 1. Draft has a saved agent → use it.
    const draft = getDraft();
    if (draft?.agentMention && draft.text?.trim()) {
      setSelectedSingleAgent(draft.agentMention);
      return;
    }

    // 2. Sticky mentions contain an agent (existing conversation / agent builder) → use it.
    // stickyMentions carries both the agent builder's draft agent
    // and the last agent mention resolved from conversation history (computed in AgentInputBar).
    if (stickyMentions) {
      const agentMention = stickyMentions.find(isRichAgentMention) ?? null;
      if (agentMention) {
        setSelectedSingleAgent(agentMention);
        return;
      }
    }

    // 3. New conversation (not agent builder) → use the user's default agent.
    if (!conversation && !isAgentBuilder) {
      // Hold off until the personal default has loaded, otherwise we'd commit @dust
      // first and then visibly swap once it arrives. This effect re-runs when loading
      // completes (deps below).
      if (isDefaultAgentLoading) {
        return;
      }

      // Prefer the user's personal default (if set and still accessible), else @dust.
      const defaultAgent =
        (defaultAgentId && allAgents.find((a) => a.sId === defaultAgentId)) ||
        allAgents.find((a) => a.sId === GLOBAL_AGENTS_SID.DUST);
      if (defaultAgent) {
        setSelectedSingleAgent(toRichAgentMentionType(defaultAgent));
      }
    }
  }, [
    isAgentBuilder,
    conversation,
    stickyMentions,
    allAgents,
    getDraft,
    setSelectedSingleAgent,
    defaultAgentId,
    isDefaultAgentLoading,
  ]);

  useEffect(() => {
    if (selectedAgent) {
      // @TODO we should handle this in each event handler and not inside the useEffect
      setSelectedSingleAgent(selectedAgent);
      externalAgentSetRef.current = true;
    } else if (pendingInputText && !pendingInputText.replace) {
      queueMicrotask(() => editorService.insertText(pendingInputText.text));
    }
  }, [selectedAgent, pendingInputText, editorService, setSelectedSingleAgent]);

  return { stickyMentionsTextContent };
};

export default useHandleMentions;
