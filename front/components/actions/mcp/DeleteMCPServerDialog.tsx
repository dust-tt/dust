import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/api/mcp";
import { useDeleteMCPServer } from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";

type DeleteMCPServerDialogProps = {
  owner: WorkspaceType;
  onClose: (deleted: boolean) => void;
  mcpServer: MCPServerType;
  isOpen: boolean;
};

export function DeleteMCPServerDialog({
  owner,
  mcpServer,
  isOpen,
  onClose,
}: DeleteMCPServerDialogProps) {
  const { deleteServer } = useDeleteMCPServer(owner);

  const [isLoading, setIsLoading] = useState(false);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Removal</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div>
            Are you sure you want to remove{" "}
            <b>{getMcpServerDisplayName(mcpServer)}</b> ?
          </div>
          <div className="mt-2">
            <b>This action cannot be undone.</b>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            disabled: isLoading,
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            isLoading,
            label: "Remove",
            variant: "warning",
            disabled: isLoading,
            onClick: async () => {
              setIsLoading(true);
              await deleteServer(mcpServer);
              setIsLoading(false);
              onClose(true);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
