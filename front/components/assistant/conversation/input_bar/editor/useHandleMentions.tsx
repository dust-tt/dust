import { AgentConfigurationType, AgentMention } from "@dust-tt/types";
import { useEffect, useMemo, useRef } from "react";

import type {
  EditorMention,
  EditorService,
} from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";

const useHandleMentions = (
  editorService: EditorService,
  agentConfigurations: AgentConfigurationType[],
  stickyMentions: AgentMention[] | undefined,
  selectedAssistant: AgentMention | null
) => {
  const stickyMentionsTextContent = useRef<string | null>(null);

  // Memoize the mentioned agents to avoid unnecessary recalculations.
  const mentionedAgentConfigurationIds = useMemo(() => {
    let mentions: AgentMention[] = [];
    if (stickyMentions?.length) {
      mentions = stickyMentions;
    } else if (selectedAssistant) {
      mentions = [selectedAssistant];
    }

    return Array.from(new Set(mentions.map((m) => m.configurationId)));
  }, [stickyMentions, selectedAssistant]);

  useEffect(() => {
    if (mentionedAgentConfigurationIds.length === 0) {
      return;
    }

    const editorIsEmpty = editorService.isEmpty();
    const onlyContainsPreviousStickyMention =
      !editorIsEmpty &&
      editorService.getTrimmedText() === stickyMentionsTextContent.current;

    // Insert sticky mentions under two conditions:
    // 1. The editor is currently empty.
    // 2. The editor contains only the sticky mention from a previously selected assistant.
    // This ensures that sticky mentions are maintained but not duplicated.
    if (editorIsEmpty || onlyContainsPreviousStickyMention) {
      const mentionsToInsert: EditorMention[] = [];

      for (const configurationId of mentionedAgentConfigurationIds) {
        const agentConfiguration = agentConfigurations.find(
          (agent) => agent.sId === configurationId
        );
        if (agentConfiguration) {
          mentionsToInsert.push({
            id: agentConfiguration.sId,
            label: agentConfiguration.name,
          });
        }
      }

      if (mentionsToInsert.length !== 0) {
        editorService.resetWithMentions(mentionsToInsert);
        stickyMentionsTextContent.current =
          editorService.getTrimmedText() ?? null;
      }
    }
  }, [agentConfigurations, editorService, mentionedAgentConfigurationIds]);
};

export default useHandleMentions;
