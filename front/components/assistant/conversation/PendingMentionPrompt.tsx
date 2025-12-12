import { Button, Chip } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

import type { WorkspaceType } from "@app/types";

import type { PendingMentionType } from "@app/pages/api/v1/w/[wId]/assistant/conversations/[cId]/mentions/pending";

interface PendingMentionPromptProps {
  conversationId: string;
  currentUserSId: string;
  owner: WorkspaceType;
  pendingMention: PendingMentionType;
  onResolved: () => void;
}

export function PendingMentionPrompt({
  conversationId,
  currentUserSId,
  owner,
  pendingMention,
  onResolved,
}: PendingMentionPromptProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMentioner = currentUserSId === pendingMention.mentionerUser.sId;

  const handleAction = useCallback(
    async (action: "confirm" | "decline") => {
      setIsProcessing(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/v1/w/${owner.sId}/assistant/conversations/${conversationId}/mentions/${pendingMention.id}/${action}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error?.message || `Failed to ${action} invitation`
          );
        }

        // Notify parent to refresh
        onResolved();
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to ${action}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [conversationId, owner.sId, pendingMention.id, onResolved]
  );

  return (
    <div className="border-structure-200 bg-structure-50 my-4 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Chip color="warning" size="xs">
              Pending Invitation
            </Chip>
          </div>
          <div className="text-element-700 mt-2 text-sm">
            {isMentioner ? (
              <>
                <strong>@{pendingMention.mentionedUser.username}</strong> is not
                in this conversation yet.
              </>
            ) : (
              <>
                Waiting for{" "}
                <strong>@{pendingMention.mentionerUser.username}</strong> to add{" "}
                <strong>@{pendingMention.mentionedUser.username}</strong>...
              </>
            )}
          </div>
          {error && (
            <div className="mt-2 text-sm text-warning-500">{error}</div>
          )}
        </div>
        {isMentioner && (
          <div className="flex gap-2">
            <Button
              label="Add to conversation"
              size="xs"
              variant="primary"
              disabled={isProcessing}
              onClick={() => handleAction("confirm")}
            />
            <Button
              label="Don't add"
              size="xs"
              variant="tertiary"
              disabled={isProcessing}
              onClick={() => handleAction("decline")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
