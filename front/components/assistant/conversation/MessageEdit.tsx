import type {LightAgentConfigurationType, MentionType, UserMessageType, WorkspaceType,} from "@dust-tt/types";
import {EditorContent} from "@tiptap/react";
import React, {useContext} from "react";

import useAssistantSuggestions from "@app/components/assistant/conversation/input_bar/editor/useAssistantSuggestions";
import type {
  EditorMention} from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import useCustomEditor, {
  getJSONFromText
} from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import {SendNotificationsContext} from "@app/components/sparkle/Notification";
import {useSubmitFunction} from "@app/lib/client/utils";
import {classNames} from "@app/lib/utils";

interface MessageEdit {
  conversationId: string;
  owner: WorkspaceType;
  userMessage: UserMessageType;
  agentConfigurations: LightAgentConfigurationType[];
}

export function MessageEdit({
  conversationId,
  owner,
  userMessage,
  agentConfigurations,
}: MessageEdit) {
  const sendNotification = useContext(SendNotificationsContext);

  const {
    submit: handleEditMessage,
    isSubmitting,
  } = useSubmitFunction(async (isEmpty: boolean, textAndMentions:{mentions:EditorMention[], text:string}) => {
    console.log('generatedJson from editor (good one)', editor?.getJSON());
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
  });
  
  const suggestions = useAssistantSuggestions(agentConfigurations, owner);
  const content = getJSONFromText(userMessage.content, agentConfigurations)
  
  const { editor } = useCustomEditor({
    suggestions,
    onEnterKeyDown: handleEditMessage,
    resetEditorContainerSize: () => {
      // Do nothing
    },
    disableAutoFocus: false,
    content
  });
  
  return (
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
  );
}
