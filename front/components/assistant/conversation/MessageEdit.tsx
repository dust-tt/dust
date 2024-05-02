import {Button, Input} from "@dust-tt/sparkle";
import type {UserMessageType, WorkspaceType,} from "@dust-tt/types";
import {useContext, useState} from "react";
import {SendNotificationsContext} from "@app/components/sparkle/Notification";
import {useSubmitFunction} from "@app/lib/client/utils";

interface AgentSuggestion {
  conversationId: string;
  owner: WorkspaceType;
  userMessage: UserMessageType;
}

export function MessageEdit({
  conversationId,
  owner,
  userMessage,
}: AgentSuggestion) {
  const [newContent, setNewContent] = useState(userMessage.content)

  const sendNotification = useContext(SendNotificationsContext);

  const {
    submit: handleSelectSuggestion,
    isSubmitting: isSelectingSuggestion,
  } = useSubmitFunction(async () => {
    const mRes = await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${userMessage.sId}/edit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Todo parse message to get new mentions
        body: JSON.stringify({
          content: newContent,
          mentions: userMessage.mentions,
        }),
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

  return (
    <div className="pt-4">
      <div className="mt-3 flex flex-1 flex-col gap-2 sm:flex-row">
        <Input
               placeholder=""
               disabled={isSelectingSuggestion}
               value={newContent} name="replace"
               onChange={(e) => {
                 setNewContent(e);
               }}
        />
        <Button
          label={"Send"}
          disabled={isSelectingSuggestion}
          onClick={() => {
            return handleSelectSuggestion();
          }}
        />
      </div>
    </div>
  );
}
