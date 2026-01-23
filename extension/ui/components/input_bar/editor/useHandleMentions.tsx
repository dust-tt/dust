import type {
  EditorMention,
  EditorService,
} from "@app/ui/components/input_bar/editor/useCustomEditor";
import type {
  AgentMentionType,
  LightAgentConfigurationType,
} from "@dust-tt/client";
import { useEffect, useRef } from "react";

const useHandleMentions = (
  editorService: EditorService,
  agentConfigurations: LightAgentConfigurationType[],
  stickyMentions: AgentMentionType[] | undefined,
  selectedAssistant: AgentMentionType | null,
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
      const mentionsToInsert: EditorMention[] = [];

      for (const configurationId of stickyMentions.map(
        (mention) => mention.configurationId
      )) {
        const agentConfiguration = agentConfigurations.find(
          (agent) => agent.sId === configurationId
        );
        if (agentConfiguration) {
          mentionsToInsert.push({
            id: agentConfiguration.sId,
            label: agentConfiguration.name,
            description: agentConfiguration.description,
          });
        }
      }

      if (mentionsToInsert.length !== 0) {
        editorService.resetWithMentions(mentionsToInsert, disableAutoFocus);
        stickyMentionsTextContent.current =
          editorService.getTrimmedText() ?? null;
      }
    }
  }, [agentConfigurations, editorService, stickyMentions, disableAutoFocus]);

  useEffect(() => {
    if (selectedAssistant) {
      const agentConfiguration = agentConfigurations.find(
        (agent) => agent.sId === selectedAssistant.configurationId
      );

      if (!agentConfiguration) {
        return;
      }

      const mention = {
        id: agentConfiguration.sId,
        label: agentConfiguration.name,
        description: agentConfiguration.description,
      };

      if (!editorService.hasMention(mention)) {
        editorService.insertMention(mention);
      }
    }
  }, [selectedAssistant, editorService, disableAutoFocus, agentConfigurations]);
};

export default useHandleMentions;
