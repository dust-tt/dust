import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  PlusIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useState } from "react";

import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import { useCreateRemoteMCPServer } from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";
import { validateUrl } from "@app/types";

type RemoteMCPServerDetailsProps = {
  owner: WorkspaceType;
  setMCPServer: (server: MCPServerType) => void;
  setIsCreating: (isCreating: boolean) => void;
};

export function CreateRemoteMCPServerModal({
  owner,
  setMCPServer,
  setIsCreating,
}: RemoteMCPServerDetailsProps) {
  const sendNotification = useSendNotification();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { createWithUrlSync } = useCreateRemoteMCPServer(owner);

  const handleSynchronize = async (e: Event) => {
    const urlValidation = validateUrl(url);

    if (!urlValidation.valid) {
      e.preventDefault();
      setError(
        "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c))."
      );
      return;
    }

    setIsCreating(true);
    try {
      const result = await createWithUrlSync(url, true);

      if (result.success) {
        sendNotification({
          title: "Success",
          type: "success",
          description: "MCP server synchronized successfully.",
        });
        setMCPServer(result.server);
      } else {
        throw new Error("Failed to synchronize MCP server");
      }
    } catch (error) {
      sendNotification({
        title: "Error synchronizing MCP server",
        type: "error",
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    } finally {
      setIsCreating(false);
      setError(null);
      setUrl("");
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button icon={PlusIcon} label="Add MCP Server" />
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <div className="flex space-x-2">
              <div className="flex-grow">
                <Input
                  id="url"
                  placeholder="https://example.com/api/mcp"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  isError={!!error}
                  message={error}
                  autoFocus
                />
              </div>
            </div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
            onClick: () => {
              setUrl("");
              setError(null);
            },
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: handleSynchronize,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
