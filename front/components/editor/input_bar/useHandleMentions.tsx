import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { EditorService } from "@app/components/editor/input_bar/useCustomEditor";
import { isSingleAgentInputEnabled } from "@app/lib/development";
import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";
import { isRichAgentMention } from "@app/types/assistant/mentions";
import type { MutableRefObject } from "react";
import { useContext, useEffect, useRef } from "react";

const useHandleMentions = (
  editorService: EditorService,
  stickyMentions: RichMention[] | undefined,
  selectedAgent: RichAgentMention | null,
  disableAutoFocus: boolean,
  pendingInputText?: string | null,
  draftAgentRestoredRef?: MutableRefObject<boolean>
) => {
  const stickyMentionsTextContent = useRef<string | null>(null);
  const singleAgentInput = isSingleAgentInputEnabled();
  const { setSelectedSingleAgent } = useContext(InputBarContext);

  // In single agent mode, sync the selected agent from sticky mentions
  // so the agent picker button shows the correct agent on existing conversations.
  // Only sync when sticky mentions are provided (existing conversations); skip for
  // new conversations (undefined stickyMentions) to avoid overriding the auto-selected default.
  // Also skip when the draft restore already set the agent to avoid overwriting the user's draft.
  useEffect(() => {
    if (!singleAgentInput || !stickyMentions) {
      return;
    }
    // Skip if the draft restore effect already set the selected agent.
    if (draftAgentRestoredRef?.current) {
      return;
    }
    const agentMention = stickyMentions.find(isRichAgentMention) ?? null;
    if (agentMention) {
      setSelectedSingleAgent(agentMention);
    }
  }, [singleAgentInput, stickyMentions, setSelectedSingleAgent, draftAgentRestoredRef]);

  useEffect(() => {
    if (!stickyMentions || stickyMentions.length === 0) {
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
      const mentionsToInsert: RichMention[] = [];

      if (singleAgentInput) {
        // Only insert user mentions into the editor; agent mentions are handled via singleAgentSelection.
        mentionsToInsert.push(
          ...stickyMentions.filter((m) => m.type !== "agent")
        );
      } else {
        mentionsToInsert.push(...stickyMentions);
      }

      if (mentionsToInsert.length !== 0) {
        queueMicrotask(() => {
          editorService.resetWithMentions(mentionsToInsert, disableAutoFocus);
          stickyMentionsTextContent.current =
            editorService.getTrimmedText() ?? null;
        });
      }
    }
  }, [editorService, stickyMentions, disableAutoFocus, singleAgentInput]);

  useEffect(() => {
    if (selectedAgent) {
      if (!editorService.hasMention(selectedAgent)) {
        // Schedule insertion to avoid synchronous editor updates during React render/effects.
        queueMicrotask(() => {
          editorService.insertMention(selectedAgent);
          // If there's pending input text (e.g. from a butler suggestion), insert it after the mention.
          if (pendingInputText) {
            editorService.insertText(pendingInputText);
          }
        });
      } else if (pendingInputText) {
        queueMicrotask(() => editorService.insertText(pendingInputText));
      }
    } else if (pendingInputText) {
      queueMicrotask(() => editorService.insertText(pendingInputText));
    }
  }, [selectedAgent, pendingInputText, editorService]);

  return { stickyMentionsTextContent };
};

export default useHandleMentions;
