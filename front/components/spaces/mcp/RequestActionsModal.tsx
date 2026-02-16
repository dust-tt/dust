import { useSendNotification } from "@app/hooks/useNotification";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
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
  PlusIcon,
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
// biome-ignore lint/plugin/noBulkLodash: existing usage
import _ from "lodash";
import { useState } from "react";

interface RequestActionsModal {
  owner: LightWorkspaceType;
  space: SpaceType;
}

export function RequestActionsModal({ owner, space }: RequestActionsModal) {
  const { serverViews, isMCPServerViewsLoading: isLoading } =
    useMCPServerViewsNotActivated({ owner, space });
  const [selectedMcpServer, setSelectedMcpServer] =
    useState<MCPServerViewType | null>(null);

  const [message, setMessage] = useState("");
  const sendNotification = useSendNotification();

  const onClose = () => {
    setMessage("");
  };

  const onSave = async () => {
    const userToId = selectedMcpServer?.editedByUser?.userId;
    if (!userToId || !selectedMcpServer) {
      sendNotification({
        type: "error",
        title: "Error sending email",
        description: "An unexpected error occurred while sending email.",
      });
    } else {
      try {
        await sendRequestActionsAccessEmail({
          emailMessage: message,
          mcpServerViewId: selectedMcpServer.sId,
          owner,
        });
        sendNotification({
          type: "success",
          title: "Email sent!",
          description: `Your request was sent to ${selectedMcpServer.editedByUser?.fullName}`,
        });
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Error sending email",
          description:
            "An unexpected error occurred while sending the request.",
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

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button label="Request Tool" icon={PlusIcon} />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            Requesting Access to{" "}
            {selectedMcpServer
              ? getMcpServerDisplayName(selectedMcpServer.server)
              : ""}
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {isLoading && <Spinner size="lg" />}

                {!isLoading && serverViews.length === 0 && (
                  <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
                    <p>
                      There are no extra tools set up that you can request
                      access to. Ask an admin to set one up.
                    </p>
                  </label>
                )}

                {serverViews.length >= 1 && (
                  <>
                    <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
                      <p>Which tools you want to get access to?</p>
                    </label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        {selectedMcpServer ? (
                          <Button
                            variant="outline"
                            label={getMcpServerDisplayName(
                              selectedMcpServer.server
                            )}
                            icon={() =>
                              getAvatar(selectedMcpServer.server, "xs")
                            }
                          />
                        ) : (
                          <Button
                            label="Pick Tools"
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
                            label={getMcpServerDisplayName(v.server)}
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
                  <p className="mb-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
                    {_.capitalize(
                      selectedMcpServer.editedByUser?.fullName ?? ""
                    )}{" "}
                    is the administrator for the{" "}
                    {selectedMcpServer
                      ? getMcpServerDisplayName(selectedMcpServer.server)
                      : ""}{" "}
                    tool within Dust. Send an email to Dust. Send an email to{" "}
                    {_.capitalize(
                      selectedMcpServer.editedByUser?.fullName ?? ""
                    )}
                    , explaining your request.
                  </p>
                  <TextArea
                    placeholder={`Hello`}
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
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Send",
            onClick: onSave,
            disabled: message.length === 0,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
