import {
  ClipboardCheckIcon,
  ClipboardIcon,
  IconButton,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import React from "react";

import type { KeyType, WorkspaceType } from "@app/types";

type APIKeyCreationSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  latestKey?: KeyType;
  workspace: WorkspaceType;
};

export const APIKeyCreationSheet = ({
  isOpen,
  onOpenChange,
  latestKey,
  workspace,
}: APIKeyCreationSheetProps) => {
  const [isCopiedWorkspaceId, copyWorkspaceId] = useCopyToClipboard();
  const [isCopiedName, copyName] = useCopyToClipboard();
  const [isCopiedDomain, copyDomain] = useCopyToClipboard();
  const [isCopiedApiKey, copyApiKey] = useCopyToClipboard();

  const domain = process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL ?? "";

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(open);
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>API Key Created</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              Your API key will remain visible for 10 minutes only. You can use
              it to authenticate with the Dust API.
            </p>
            <br />
            <div className="mt-4">
              <Page.H variant="h5">Name</Page.H>
              <Page.Horizontal align="center">
                <pre className="dd-privacy-mask flex-grow overflow-x-auto rounded bg-muted-background p-2 font-mono dark:bg-muted-background-night">
                  {latestKey?.name}
                </pre>
                <IconButton
                  tooltip="Copy to clipboard"
                  icon={isCopiedName ? ClipboardCheckIcon : ClipboardIcon}
                  onClick={async () => {
                    if (latestKey?.name) {
                      await copyName(latestKey.name);
                    }
                  }}
                />
              </Page.Horizontal>
            </div>
            <div className="mt-4">
              <Page.H variant="h5">Domain</Page.H>
              <Page.Horizontal align="center">
                <pre className="dd-privacy-mask flex-grow overflow-x-auto rounded bg-muted-background p-2 font-mono dark:bg-muted-background-night">
                  {domain}
                </pre>
                <IconButton
                  tooltip="Copy to clipboard"
                  icon={isCopiedDomain ? ClipboardCheckIcon : ClipboardIcon}
                  onClick={async () => {
                    await copyDomain(domain);
                  }}
                />
              </Page.Horizontal>
            </div>
            <div className="mt-4">
              <Page.H variant="h5">Workspace ID</Page.H>
              <Page.Horizontal align="center">
                <pre className="dd-privacy-mask flex-grow overflow-x-auto rounded bg-muted-background p-2 font-mono dark:bg-muted-background-night">
                  {workspace.sId}
                </pre>
                <IconButton
                  tooltip="Copy to clipboard"
                  icon={
                    isCopiedWorkspaceId ? ClipboardCheckIcon : ClipboardIcon
                  }
                  onClick={async () => {
                    await copyWorkspaceId(workspace.sId);
                  }}
                />
              </Page.Horizontal>
            </div>
            <div className="mt-4">
              <Page.H variant="h5">API Key</Page.H>
              <Page.Horizontal align="center">
                <pre className="dd-privacy-mask flex-grow overflow-x-auto rounded bg-muted-background p-2 font-mono dark:bg-muted-background-night">
                  {latestKey?.secret}
                </pre>
                <IconButton
                  tooltip="Copy to clipboard"
                  icon={isCopiedApiKey ? ClipboardCheckIcon : ClipboardIcon}
                  onClick={async () => {
                    if (latestKey?.secret) {
                      await copyApiKey(latestKey.secret);
                    }
                  }}
                />
              </Page.Horizontal>
            </div>
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
};
