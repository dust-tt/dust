// useHandleMentions.js
import { AgentMention, WorkspaceType } from "@dust-tt/types";
import { Editor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useAgentConfigurations } from "@app/lib/swr";

const useHandleMentions = (
  editor: Editor | null,
  owner: WorkspaceType,
  conversationId: string | null,
  stickyMentions: AgentMention[] | undefined,
  selectedAssistant: AgentMention | null
) => {
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: conversationId ? { conversationId } : "list",
  });

  // Memoize the mentioned agents to avoid unnecessary recalculations.
  const mentionedAgentConfigurationIds = useMemo(() => {
    const mentions = stickyMentions?.length
      ? stickyMentions
      : [selectedAssistant].filter(Boolean);
    return new Set(mentions.map((m) => m.configurationId));
  }, [stickyMentions, selectedAssistant]);

  const stickyMentionsTextContent = useRef<string | null>(null);

  // Function to insert mentions
  // TODO: Move to a class/service.
  const insertMentions = useCallback(() => {
    if (editor) {
      editor.commands.setContent("");
      for (const configurationId of mentionedAgentConfigurationIds) {
        const agentConfiguration = agentConfigurations.find(
          (agent) => agent.sId === configurationId
        );

        if (agentConfiguration) {
          editor
            .chain()
            .focus()
            .insertContent({
              type: "mention",
              attrs: {
                id: agentConfiguration.sId,
                label: agentConfiguration.name,
              },
            })
            .insertContent(" ")
            .run(); // add an extra space after the mention
        }
      }
      // Move the cursor to the end of the editor content
      editor.commands.focus("end");
    }
  }, [editor, mentionedAgentConfigurationIds, agentConfigurations]);

  useEffect(() => {
    if (!stickyMentions?.length && !selectedAssistant) {
      return;
    }

    // TODO: Change logic to use service.
    const editorIsEmpty = editor?.isEmpty;
    const hasContent = editorIsEmpty === false;
    const textContentHasChanged =
      hasContent &&
      editor?.getText().trim() !== stickyMentionsTextContent.current;

    if (textContentHasChanged) {
      // Content has changed, we don't clear it (we preserve whatever the user typed)
      return;
    }

    // Insert mentions if appropriate
    insertMentions();

    stickyMentionsTextContent.current = editor?.getText().trim() || null;
  }, [
    stickyMentions,
    selectedAssistant,
    mentionedAgentConfigurationIds,
    editor,
    insertMentions,
  ]);
};

export default useHandleMentions;
