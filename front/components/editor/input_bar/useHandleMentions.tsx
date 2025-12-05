import { useEffect, useRef } from "react";

import type { EditorService } from "@app/components/editor/input_bar/useCustomEditor";
import type { RichAgentMention, RichMention } from "@app/types";

const useHandleMentions = (
  editorService: EditorService,
  stickyMentions: RichMention[] | undefined,
  selectedAgent: RichAgentMention | null,
  disableAutoFocus: boolean
) => {
  const stickyMentionsTextContent = useRef<string | null>(null);

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

      mentionsToInsert.push(...stickyMentions);

      if (mentionsToInsert.length !== 0) {
        queueMicrotask(() => {
          editorService.resetWithMentions(mentionsToInsert, disableAutoFocus);
          stickyMentionsTextContent.current =
            editorService.getTrimmedText() ?? null;
        });
      }
    }
  }, [editorService, stickyMentions, disableAutoFocus]);

  useEffect(() => {
    if (selectedAgent) {
      if (!editorService.hasMention(selectedAgent)) {
        // Schedule insertion to avoid synchronous editor updates during React render/effects.
        queueMicrotask(() => editorService.insertMention(selectedAgent));
      }
    }
  }, [selectedAgent, editorService]);
};

export default useHandleMentions;
