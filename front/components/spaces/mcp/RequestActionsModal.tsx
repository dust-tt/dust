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
  useSendNotification,
} from "@dust-tt/sparkle";
import _ from "lodash";
import { useState } from "react";

import { MCP_SERVER_ICONS } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/actions/mcp_metadata";
import { sendRequestActionsAccessEmail } from "@app/lib/email";
import { useMCPServerViewsNotActivated } from "@app/lib/swr/mcp_server_views";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, SpaceType } from "@app/types";

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
          userTo: userToId,
          emailMessage: message,
          serverName: selectedMcpServer.server.name,
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
            mcpServerId: selectedMcpServer.id,
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
        <Button label="Request Action" icon={PlusIcon} />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            Requesting Access to {selectedMcpServer?.server.name}
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
                      You have no actions set up. Ask an admin to set one up.
                    </p>
                  </label>
                )}

                {serverViews.length >= 1 && (
                  <>
                    <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
                      <p>Which actions you want to get access to?</p>
                    </label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        {selectedMcpServer ? (
                          <Button
                            variant="outline"
                            label={selectedMcpServer.server.name}
                            icon={
                              MCP_SERVER_ICONS[selectedMcpServer.server.icon]
                            }
                          />
                        ) : (
                          <Button
                            label="Pick your MCP Server"
                            variant="outline"
                            size="sm"
                            isSelect
                          />
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {serverViews.map((v) => (
                          <DropdownMenuItem
                            key={v.id}
                            label={v.server.name}
                            icon={MCP_SERVER_ICONS[v.server.icon]}
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
                    is the administrator for the {selectedMcpServer.server.name}{" "}
                    action within Dust. Send an email to{" "}
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
