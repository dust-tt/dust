import {
  Button,
  Checkbox,
  CheckIcon,
  CodeBlockWithExtendedSupport,
  CollapsibleComponent,
  ContentMessage,
  Label,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { getIcon } from "@app/components/resources/resources_icons";
import { useValidateAction } from "@app/hooks/useValidateAction";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType, UserType } from "@app/types";
import { asDisplayName } from "@app/types";

interface MCPToolValidationRequiredProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  blockedAction: BlockedToolExecution;
  conversationId: string;
  messageId: string;
}

export function MCPToolValidationRequired({
  triggeringUser,
  owner,
  blockedAction,
  conversationId,
  messageId,
}: MCPToolValidationRequiredProps) {
  const { user } = useUser();
  const [neverAskAgain, setNeverAskAgain] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { removeCompletedAction } = useBlockedActionsContext();
  const { validateAction, isValidating } = useValidateAction({
    owner,
    conversationId,
    onError: setErrorMessage,
  });

  const isTriggeredByCurrentUser = useMemo(
    () => blockedAction.userId === user?.sId,
    [blockedAction.userId, user?.sId]
  );

  const icon = blockedAction.metadata.icon
    ? getIcon(blockedAction.metadata.icon)
    : undefined;

  const hasDetails =
    blockedAction?.inputs && Object.keys(blockedAction.inputs).length > 0;

  const handleValidation = async (approved: MCPValidationOutputType) => {
    setErrorMessage(null);

    const result = await validateAction({
      validationRequest: blockedAction,
      messageId,
      approved:
        approved === "approved" && neverAskAgain ? "always_approved" : approved,
    });

    if (!result.success) {
      setErrorMessage("Failed to assess action approval. Please try again.");
      return;
    }
    removeCompletedAction(blockedAction.actionId);
    setNeverAskAgain(false);
  };

  const title = useMemo(() => {
    if (isTriggeredByCurrentUser) {
      return `Execute "${asDisplayName(blockedAction.metadata.toolName)}" from ${asDisplayName(blockedAction.metadata.mcpServerName)}?`;
    } else {
      return `Permission needed for ${asDisplayName(blockedAction.metadata.mcpServerName)}.`;
    }
  }, [
    blockedAction.metadata.mcpServerName,
    blockedAction.metadata.toolName,
    isTriggeredByCurrentUser,
  ]);

  return (
    <ContentMessage
      title={title}
      variant="primary"
      className="flex w-80 min-w-[500px] flex-col gap-3"
      icon={icon}
    >
      {isTriggeredByCurrentUser ? (
        <>
          {hasDetails && (
            <CollapsibleComponent
              triggerChildren={
                <span className="my-2 font-medium">Details</span>
              }
              contentChildren={
                <div className="max-h-80 overflow-auto bg-muted dark:bg-muted-night">
                  <CodeBlockWithExtendedSupport className="language-json">
                    {JSON.stringify(blockedAction.inputs, null, 2)}
                  </CodeBlockWithExtendedSupport>
                </div>
              }
            />
          )}
          {errorMessage && (
            <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
              {errorMessage}
            </div>
          )}
          <div className="mt-3 flex flex-row gap-3">
            {blockedAction.stake === "low" && (
              <div className="flex flex-row justify-end gap-2">
                <Label className="flex w-fit cursor-pointer flex-row items-center gap-2 py-2 pr-2 text-xs">
                  <Checkbox
                    checked={neverAskAgain}
                    onCheckedChange={(check) => {
                      setNeverAskAgain(!!check);
                    }}
                  />
                  <span>Always allow</span>
                </Label>
              </div>
            )}
            <div className="flex-grow" />
            <Button
              label="Decline"
              variant="outline"
              size="xs"
              icon={XMarkIcon}
              disabled={isValidating}
              onClick={() => void handleValidation("rejected")}
            />
            <Button
              label="Allow"
              variant="highlight"
              size="xs"
              icon={CheckIcon}
              disabled={isValidating}
              onClick={() => void handleValidation("approved")}
            />
          </div>
        </>
      ) : (
        <div className="font-sm whitespace-normal break-words text-foreground dark:text-foreground-night">
          Waiting for{" "}
          <span className="font-semibold">{triggeringUser?.fullName}</span> to
          confirm.
        </div>
      )}
    </ContentMessage>
  );
}
