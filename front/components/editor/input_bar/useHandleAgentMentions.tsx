import { useEffect, useRef } from "react";

import type { EditorService } from "@app/components/editor/input_bar/useCustomEditor";
import type {
  AgentMention,
  LightAgentConfigurationType,
  RichMention,
} from "@app/types";

const useHandleAgentMentions = (
  editorService: EditorService,
  agentConfigurations: LightAgentConfigurationType[],
  stickyMentions: AgentMention[] | undefined,
  selectedAgent: AgentMention | null,
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

      for (const configurationId of stickyMentions.map(
        (mention) => mention.configurationId
      )) {
        const agentConfiguration = agentConfigurations.find(
          (agent) => agent.sId === configurationId
        );
        if (agentConfiguration) {
          mentionsToInsert.push({
            type: "agent",
            id: agentConfiguration.sId,
            label: agentConfiguration.name,
            description: agentConfiguration.description,
            pictureUrl: agentConfiguration.pictureUrl,
          });
        }
      }

      if (mentionsToInsert.length !== 0) {
        queueMicrotask(() => {
          editorService.resetWithMentions(mentionsToInsert, disableAutoFocus);
          stickyMentionsTextContent.current =
            editorService.getTrimmedText() ?? null;
        });
      }
    }
  }, [agentConfigurations, editorService, stickyMentions, disableAutoFocus]);

  useEffect(() => {
    if (selectedAgent) {
      const agentConfiguration = agentConfigurations.find(
        (agent) => agent.sId === selectedAgent.configurationId
      );

      if (!agentConfiguration) {
        return;
      }

      const mention: RichMention = {
        type: "agent",
        id: agentConfiguration.sId,
        label: agentConfiguration.name,
        description: agentConfiguration.description,
        pictureUrl: agentConfiguration.pictureUrl,
      };

      if (!editorService.hasMention(mention)) {
        // Schedule insertion to avoid synchronous editor updates during React render/effects.
        queueMicrotask(() => editorService.insertMention(mention));
      }
    }
  }, [selectedAgent, editorService, disableAutoFocus, agentConfigurations]);
};

export default useHandleAgentMentions;
