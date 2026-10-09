import type { PendingInputText } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { EditorService } from "@app/components/editor/input_bar/useCustomEditor";
import { useSearchParam } from "@app/lib/platform";
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
import { useContext, useEffect, useRef, useState } from "react";

interface UseHandleMentionsOptions {
  allAgents: LightAgentConfigurationType[];
  // While true, `allAgents` is still loading and cannot resolve the agent to select yet.
  isAgentsLoading: boolean;
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

// The user's personal default if set and still accessible, else @dust.
function findDefaultAgent(
  allAgents: LightAgentConfigurationType[],
  defaultAgentId: string | null | undefined
): LightAgentConfigurationType | undefined {
  return (
    (defaultAgentId && allAgents.find((a) => a.sId === defaultAgentId)) ||
    allAgents.find((a) => a.sId === GLOBAL_AGENTS_SID.DUST)
  );
}

const useHandleMentions = ({
  allAgents,
  isAgentsLoading,
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
  const {
    selectedSingleAgent,
    setSelectedSingleAgent,
    setSuppressDefaultAgent,
    suppressDefaultAgent,
  } = useContext(InputBarContext);
  // When present, useAgentFromSearchParam owns the selection on the new-conversation page.
  const agentSearchParam = useSearchParam("agent");
  // When present, useUserFromSearchParam owns the composer and clears any agent.
  const userSearchParam = useSearchParam("user");

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
      setSuppressDefaultAgent(false);
      setSelectedSingleAgent(null);
    }

    // An external source (URL param) already set the agent — do not override.
    if (externalAgentSetRef.current) {
      return;
    }

    // ?user= still in the URL: leave the composer to useUserFromSearchParam.
    if (userSearchParam && !conversation && !isAgentBuilder) {
      setSelectedSingleAgent(null);
      return;
    }

    // New conversation with ?agent= in the URL: leave selection to
    // useAgentFromSearchParam / the selectedAgent effect. Applying draft, sticky,
    // or @dust here races that path and can overwrite the custom agent in the URL.
    // This must win over suppressDefaultAgent so Cmd+K → agent still applies after
    // a prior member deep-link (existing composer content is kept).
    if (agentSearchParam && !conversation && !isAgentBuilder) {
      return;
    }

    // After a user deep-link was consumed: suppress default @dust only.
    if (suppressDefaultAgent && !conversation && !isAgentBuilder) {
      setSelectedSingleAgent(null);
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

      const defaultAgent = findDefaultAgent(allAgents, defaultAgentId);
      if (defaultAgent) {
        setSelectedSingleAgent(toRichAgentMentionType(defaultAgent));
      }
    }
  }, [
    agentSearchParam,
    userSearchParam,
    suppressDefaultAgent,
    isAgentBuilder,
    conversation,
    stickyMentions,
    allAgents,
    getDraft,
    setSelectedSingleAgent,
    setSuppressDefaultAgent,
    defaultAgentId,
    isDefaultAgentLoading,
  ]);

  useEffect(() => {
    if (selectedAgent) {
      // @TODO we should handle this in each event handler and not inside the useEffect
      setSuppressDefaultAgent(false);
      setSelectedSingleAgent(selectedAgent);
      externalAgentSetRef.current = true;
    } else if (pendingInputText && !pendingInputText.replace) {
      queueMicrotask(() => editorService.insertText(pendingInputText.text));
    }
  }, [
    selectedAgent,
    pendingInputText,
    editorService,
    setSelectedSingleAgent,
    setSuppressDefaultAgent,
  ]);

  // Once the composer has had an agent, a null selection is a choice (e.g. the user deselected
  // the agent), not a selection still being resolved.
  const [hasHadSelectedAgent, setHasHadSelectedAgent] = useState(false);
  if (selectedSingleAgent && !hasHadSelectedAgent) {
    setHasHadSelectedAgent(true);
  }

  // A new conversation selects its agent asynchronously (from ?agent= or the default agent),
  // through fetches and effects: it is pending until selected, as long as there is one to select.
  const willSelectAgent = agentSearchParam
    ? allAgents.some((a) => a.sId === agentSearchParam)
    : !!findDefaultAgent(allAgents, defaultAgentId);
  const isSelectedAgentPending =
    !conversation &&
    !isAgentBuilder &&
    !userSearchParam &&
    !suppressDefaultAgent &&
    !selectedSingleAgent &&
    !hasHadSelectedAgent &&
    (isAgentsLoading || !!isDefaultAgentLoading || willSelectAgent);

  return { stickyMentionsTextContent, isSelectedAgentPending };
};

export default useHandleMentions;
