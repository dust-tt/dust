import { useSendNotification } from "@app/hooks/useNotification";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { sendRequestActionsAccessEmail } from "@app/lib/email";
import { useMCPServerViewsNotActivated } from "@app/lib/swr/mcp_servers";
import logger from "@app/logger/logger";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Plus,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import capitalize from "lodash/capitalize";
import { useState } from "react";

interface RequestActionsModal {
  owner: LightWorkspaceType;
  space: SpaceType;
}

export function RequestActionsModal({ owner, space }: RequestActionsModal) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const { serverViews, isMCPServerViewsLoading: isLoading } =
    useMCPServerViewsNotActivated({ owner, space, disabled: !isOpen });
  const [selectedMcpServer, setSelectedMcpServer] =
    useState<MCPServerViewType | null>(null);

  const [message, setMessage] = useState("");
  const sendNotification = useSendNotification();

  const onClose = () => {
    setMessage("");
    setSelectedMcpServer(null);
    setIsOpen(false);
  };

  const onSave = async () => {
    const userToId = selectedMcpServer?.editedByUser?.userId;
    if (!userToId || !selectedMcpServer) {
      sendNotification({
        type: "error",
        title: t`Error sending email`,
        description: t`An unexpected error occurred while sending email.`,
      });
    } else {
      try {
        await sendRequestActionsAccessEmail({
          emailMessage: message,
          mcpServerViewId: selectedMcpServer.sId,
          owner,
        });
        const adminFullName = selectedMcpServer.editedByUser?.fullName;
        sendNotification({
          type: "success",
          title: t`Email sent!`,
          description: t`Your request was sent to ${adminFullName}`,
        });
      } catch (e) {
        sendNotification({
          type: "error",
          title: t`Error sending email`,
          description: t`An unexpected error occurred while sending the request.`,
        });
        logger.error(
          {
            userToId,
            mcpServerId: selectedMcpServer.sId,
            error: e,
          },
          "Error sending email"
        );
      }
      onClose();
    }
  };

  const selectedToolName = selectedMcpServer
    ? getMcpServerViewDisplayName(selectedMcpServer)
    : "";
  const adminName = capitalize(selectedMcpServer?.editedByUser?.fullName ?? "");

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => (open ? setIsOpen(true) : onClose())}
    >
      <SheetTrigger asChild>
        <Button label={t`Request tool`} icon={Plus} />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            {selectedMcpServer
              ? t`Requesting access to ${selectedToolName}`
              : t`Requesting access`}
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {isLoading && <Spinner size="lg" />}

                {!isLoading && serverViews.length === 0 && (
                  <label className="block text-sm font-medium text-muted-foreground">
                    <p>
                      <Trans>
                        There are no extra tools set up that you can request
                        access to. Ask an admin to set one up.
                      </Trans>
                    </p>
                  </label>
                )}

                {serverViews.length >= 1 && (
                  <>
                    <label className="block text-sm font-medium text-muted-foreground">
                      <p>
                        <Trans>Which tools you want to get access to?</Trans>
                      </p>
                    </label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        {selectedMcpServer ? (
                          <Button
                            variant="outline"
                            label={getMcpServerViewDisplayName(
                              selectedMcpServer
                            )}
                            icon={() =>
                              getAvatar(selectedMcpServer.server, "xs")
                            }
                          />
                        ) : (
                          <Button
                            label={t`Pick tools`}
                            variant="outline"
                            size="sm"
                            isSelect
                          />
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {serverViews.map((v) => (
                          <DropdownMenuItem
                            key={v.sId}
                            label={getMcpServerViewDisplayName(v)}
                            icon={() => getAvatar(v.server, "xs")}
                            onClick={() => setSelectedMcpServer(v)}
                          />
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>

              {selectedMcpServer && (
                <div className="flex flex-col gap-2">
                  <p className="mb-2 text-sm text-muted-foreground">
                    <Trans>
                      {adminName} is the administrator for the{" "}
                      {selectedToolName} tool within Dust. Send an email to{" "}
                      {adminName}, explaining your request.
                    </Trans>
                  </p>
                  <TextArea
                    placeholder={t`Hello`}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="mb-2"
                  />
                </div>
              )}
            </div>
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: t`Send`,
            onClick: onSave,
            disabled: message.length === 0,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
