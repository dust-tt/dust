import { Button } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  MentionType,
  UserMessageType,
  WorkspaceType,
} from "@dust-tt/types";
import { EditorContent } from "@tiptap/react";
import React, { useContext, useMemo } from "react";

import useAssistantSuggestions from "@app/components/assistant/conversation/input_bar/editor/useAssistantSuggestions";
import type { EditorMention } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import useCustomEditor, {
  getJSONFromText,
} from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { classNames } from "@app/lib/utils";

interface MessageEdit {
  conversationId: string;
  owner: WorkspaceType;
  userMessage: UserMessageType;
  agentConfigurations: LightAgentConfigurationType[];
  onClose: () => void;
}

export function MessageEdit({
  conversationId,
  owner,
  userMessage,
  agentConfigurations,
  onClose,
}: MessageEdit) {
  const sendNotification = useContext(SendNotificationsContext);

  const { submit: handleEditMessage, isSubmitting } = useSubmitFunction(
    async (
      textAndMentions: { mentions: EditorMention[]; text: string }
    ) => {
      const { mentions: rawMentions, text } = textAndMentions;
      const mentions: MentionType[] = rawMentions.map((m) => ({
        configurationId: m.id,
      }));

      const body = {
        content: text,
        mentions,
      };

      const mRes = await fetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${userMessage.sId}/edit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!mRes.ok) {
        const data = await mRes.json();
        window.alert(`Error adding mention to message: ${data.error.message}`);
        sendNotification({
          type: "error",
          title: "Invite sent",
          description: `Error adding mention to message: ${data.error.message}`,
        });
      }

      onClose();
    }
  );

  const suggestions = useAssistantSuggestions(agentConfigurations, owner);
  const content = useMemo(
    () => getJSONFromText(userMessage.content, agentConfigurations),
    [userMessage.content, agentConfigurations]
  );

  const { editor, editorService } = useCustomEditor({
    suggestions,
    onEnterKeyDown: (_, textAndMentions) => handleEditMessage(textAndMentions),
    resetEditorContainerSize: () => {
      // Do nothing
    },
    disableAutoFocus: false,
    content,
  });

  return (
    <div>
      <div className="whitespace-pre-wrap py-2 text-base font-normal leading-7 text-element-800 first:pt-0 last:pb-0">
        <EditorContent
          disabled={isSubmitting}
          editor={editor}
          className={classNames(
            //contentEditableClasses,
            "scrollbar-hide",
            "overflow-y-auto",
            "max-h-64"
          )}
        />
      </div>
      <div className="flex flex-1 gap-3">
        <Button
          variant="secondary"
          label="Cancel"
          size="sm"
          disabled={isSubmitting}
          onClick={onClose}
        />
        <Button
          variant="primary"
          label="Save"
          size="sm"
          disabled={isSubmitting}
          onClick={() =>
            handleEditMessage(
              editorService.getTextAndMentions()
            )
          }
        />
      </div>
    </div>
  );
}
