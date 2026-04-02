import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { EditorService } from "@app/components/editor/input_bar/useCustomEditor";
import { isSingleAgentInputEnabled } from "@app/lib/development";
import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";
import { isRichAgentMention } from "@app/types/assistant/mentions";
import { useContext, useEffect, useRef } from "react";

const useHandleMentions = (
  editorService: EditorService,
  stickyMentions: RichMention[] | undefined,
  selectedAgent: RichAgentMention | null,
  disableAutoFocus: boolean,
  pendingInputText?: string | null
) => {
  const stickyMentionsTextContent = useRef<string | null>(null);
  const singleAgentInput = isSingleAgentInputEnabled();
  const { setSelectedSingleAgent } = useContext(InputBarContext);

  // In single agent mode, sync the selected agent from sticky mentions
  // so the agent picker button shows the correct agent on existing conversations,
  // and clears it when navigating to a new conversation.
  useEffect(() => {
    if (!singleAgentInput) {
      return;
    }
    const agentMention = stickyMentions?.find(isRichAgentMention) ?? null;
    setSelectedSingleAgent(agentMention);
  }, [singleAgentInput, stickyMentions, setSelectedSingleAgent]);

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

  // Insert the selected agent mention into the editor (non-single-agent mode only)
  // and any pending input text (e.g. from butler suggestions).
  // Scheduled via queueMicrotask to avoid synchronous editor updates during React render/effects.
  useEffect(() => {
    queueMicrotask(() => {
      if (
        !singleAgentInput &&
        selectedAgent &&
        !editorService.hasMention(selectedAgent)
      ) {
        editorService.insertMention(selectedAgent);
        setSelectedAgent(null);
      }
      if (pendingInputText) {
        editorService.insertText(pendingInputText);
      }
    });
  }, [selectedAgent, pendingInputText, editorService, singleAgentInput]);

  return { stickyMentionsTextContent };
};

export default useHandleMentions;
