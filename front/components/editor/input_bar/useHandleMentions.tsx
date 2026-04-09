import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { EditorService } from "@app/components/editor/input_bar/useCustomEditor";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
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
  isAgentBuilder: boolean;
  pendingInputText?: string | null;
  selectedAgent: RichAgentMention | null;
  stickyMentions?: RichMention[];
}

const useHandleMentions = ({
  allAgents,
  conversation,
  disableAutoFocus,
  editorService,
  getDraft,
  isAgentBuilder,
  pendingInputText,
  selectedAgent,
  stickyMentions,
}: UseHandleMentionsOptions) => {
  const stickyMentionsTextContent = useRef<string | null>(null);
  const { hasFeature } = useFeatureFlags();
  const singleAgentInput = hasFeature("enable_steering");
  const { setSelectedSingleAgent } = useContext(InputBarContext);

  // Priority: draft > sticky mentions > @dust fallback.
  // Also resets when the conversation changes so stale state doesn't leak.
  const prevConversationIdRef = useRef(conversation?.sId ?? null);

  // Tracks when an agent has been explicitly set via the URL ?agent= param.
  // When set, the priority resolution effect must not override it with
  // stickyMentions or the @Dust fallback.
  const externalAgentSetRef = useRef(false);

  useEffect(() => {
    if (!singleAgentInput) {
      return;
    }

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
    if (draft?.agentMention) {
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

    // 3. New conversation (not agent builder) → fall back to @dust.
    if (!conversation && !isAgentBuilder) {
      const dustAgent = allAgents.find((a) => a.sId === GLOBAL_AGENTS_SID.DUST);
      if (dustAgent) {
        setSelectedSingleAgent(toRichAgentMentionType(dustAgent));
      }
    }
  }, [
    singleAgentInput,
    isAgentBuilder,
    conversation,
    stickyMentions,
    allAgents,
    getDraft,
    setSelectedSingleAgent,
  ]);

  // In single-agent mode, agent mentions are handled via the agent picker button,
  // not inserted into the editor. Sticky mentions only contain agent mentions in
  // single-agent mode, so we skip editor insertion entirely.
  useEffect(() => {
    if (singleAgentInput || !stickyMentions || stickyMentions.length === 0) {
      return;
    }

    const editorIsEmpty = editorService.isEmpty();
    const onlyContainsPreviousStickyMention =
      !editorIsEmpty &&
      editorService.getTrimmedText() === stickyMentionsTextContent.current;

    // Insert sticky mentions under two conditions:
    // 1. The editor is currently empty.
    // 2. The editor contains only the sticky mention from a previously selected agent.
    // This ensures that sticky mentions are maintained but not duplicated.
    if (editorIsEmpty || onlyContainsPreviousStickyMention) {
      queueMicrotask(() => {
        editorService.resetWithMentions(stickyMentions, disableAutoFocus);
        stickyMentionsTextContent.current =
          editorService.getTrimmedText() ?? null;
      });
    }
  }, [editorService, stickyMentions, disableAutoFocus, singleAgentInput]);

  useEffect(() => {
    if (selectedAgent) {
      if (singleAgentInput) {
        // @TODO we should handle this in each event handler and not inside the useEffect
        setSelectedSingleAgent(selectedAgent);
        externalAgentSetRef.current = true;
        // If the restored draft contains @user mentions, clear the editor
        // to prevent the user-mention handler from calling
        // setSelectedSingleAgent(null) and overriding the URL agent.
        const { mentions } = editorService.getMarkdownAndMentions();
        if (mentions.some((m) => m.type === "user")) {
          queueMicrotask(() => editorService.clearEditor());
        }
        return;
      }
      if (!editorService.hasMention(selectedAgent)) {
        queueMicrotask(() => {
          editorService.insertMention(selectedAgent);
          if (pendingInputText) {
            editorService.insertText(pendingInputText);
          }
        });
      } else if (pendingInputText) {
        // Schedule insertion to avoid synchronous editor updates during React render/effects.
        queueMicrotask(() => editorService.insertText(pendingInputText));
      }
      // If there's pending input text (e.g. from a butler suggestion), insert it after the mention.
    } else if (pendingInputText) {
      queueMicrotask(() => editorService.insertText(pendingInputText));
    }
  }, [
    selectedAgent,
    pendingInputText,
    editorService,
    setSelectedSingleAgent,
    singleAgentInput,
  ]);

  return { stickyMentionsTextContent };
};

export default useHandleMentions;
