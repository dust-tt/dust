import {
  Card,
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  Label,
  PlanetIcon,
  Tooltip,
  UserIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import type { MCPServerType } from "@app/lib/api/mcp";

type MCPServerSetupDialogProps = {
  server: MCPServerType;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (apiKey: string) => Promise<void>;
};

export function MCPServerSetupDialog({
  server,
  isOpen,
  onClose,
  onConfirm,
}: MCPServerSetupDialogProps) {
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isRequired = server.developerSecretSelection === "required";
  const isValid = !isRequired || apiKey.trim().length > 0;

  const handleConfirm = async () => {
    if (!isValid) {
      return;
    }
    setIsLoading(true);
    try {
      await onConfirm(apiKey);
      setApiKey("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setApiKey("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent size="md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              {getAvatarFromIcon(server.icon, "sm")}
              <span>Set up {server.name}</span>
            </div>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-6">
            <div className="space-y-4">
              <div className="heading-lg text-foreground dark:text-foreground-night">
                Connection type
              </div>
              <div className="grid w-full grid-cols-2 gap-4">
                <Tooltip
                  label="Individual connection is not supported for API key authentication."
                  trigger={
                    <Card
                      variant="primary"
                      disabled={true}
                      className="h-full cursor-not-allowed"
                    >
                      <div className="flex flex-col gap-1 p-1">
                        <div className="flex items-center gap-2">
                          <Icon
                            visual={UserIcon}
                            className="text-muted-foreground dark:text-muted-foreground-night"
                          />
                          <span className="font-medium text-muted-foreground dark:text-muted-foreground-night">
                            Individual
                          </span>
                        </div>
                        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                          Each member connects their own account.
                        </span>
                      </div>
                    </Card>
                  }
                  tooltipTriggerAsChild
                />
                <Card
                  variant="secondary"
                  selected={true}
                  className={cn("h-full", "cursor-pointer")}
                >
                  <div className="flex flex-col gap-1 p-1">
                    <div className="flex items-center gap-2">
                      <Icon visual={PlanetIcon} className="text-highlight" />
                      <span className="font-medium text-highlight">Shared</span>
                    </div>
                    <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      All members use the same service account credentials.
                    </span>
                  </div>
                </Card>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={`Enter your ${server.name} API key`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                isError={isRequired && apiKey.trim().length === 0}
                message={
                  isRequired && apiKey.trim().length === 0
                    ? "API key is required"
                    : undefined
                }
              />
              {server.documentationUrl && (
                <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Find your{" "}
                  <a
                    href={server.documentationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline dark:text-primary-night"
                  >
                    {server.name} API key
                  </a>
                </div>
              )}
            </div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: "Connect",
            variant: "primary",
            disabled: !isValid || isLoading,
            isLoading,
            onClick: handleConfirm,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
