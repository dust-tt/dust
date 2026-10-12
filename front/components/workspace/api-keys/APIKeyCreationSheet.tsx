import config from "@app/lib/api/config";
import type { KeyType } from "@app/types/key";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Clipboard,
  ClipboardCheck,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
  const [isCopiedWorkspaceId, copyWorkspaceId] = useCopyToClipboard();
  const [isCopiedName, copyName] = useCopyToClipboard();
  const [isCopiedDomain, copyDomain] = useCopyToClipboard();
  const [isCopiedApiKey, copyApiKey] = useCopyToClipboard();

  const domain = config.getApiBaseUrl();

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
          <SheetTitle>
            <Trans>API Key Created</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              <Trans>
                Your API key will remain visible for 10 minutes only. You can
                use it to authenticate with the Dust API.
              </Trans>
            </p>
            <br />
            <div className="mt-4">
              <Page.H variant="h5">
                <Trans>Name</Trans>
              </Page.H>
              <Page.Horizontal align="center">
                <pre className="dd-privacy-mask flex-grow overflow-x-auto rounded bg-muted-background p-2 font-mono">
                  {latestKey?.name}
                </pre>
                <Button
                  tooltip={t`Copy to clipboard`}
                  icon={isCopiedName ? ClipboardCheck : Clipboard}
                  onClick={async () => {
                    if (latestKey?.name) {
                      await copyName(latestKey.name);
                    }
                  }}
                  variant="ghost-secondary"
                />
              </Page.Horizontal>
            </div>
            <div className="mt-4">
              <Page.H variant="h5">
                <Trans>Domain</Trans>
              </Page.H>
              <Page.Horizontal align="center">
                <pre className="dd-privacy-mask flex-grow overflow-x-auto rounded bg-muted-background p-2 font-mono">
                  {domain}
                </pre>
                <Button
                  tooltip={t`Copy to clipboard`}
                  icon={isCopiedDomain ? ClipboardCheck : Clipboard}
                  onClick={async () => {
                    await copyDomain(domain);
                  }}
                  variant="ghost-secondary"
                />
              </Page.Horizontal>
            </div>
            <div className="mt-4">
              <Page.H variant="h5">
                <Trans>Workspace ID</Trans>
              </Page.H>
              <Page.Horizontal align="center">
                <pre className="dd-privacy-mask flex-grow overflow-x-auto rounded bg-muted-background p-2 font-mono">
                  {workspace.sId}
                </pre>
                <Button
                  tooltip={t`Copy to clipboard`}
                  icon={isCopiedWorkspaceId ? ClipboardCheck : Clipboard}
                  onClick={async () => {
                    await copyWorkspaceId(workspace.sId);
                  }}
                  variant="ghost-secondary"
                />
              </Page.Horizontal>
            </div>
            <div className="mt-4">
              <Page.H variant="h5">
                <Trans>API Key</Trans>
              </Page.H>
              <Page.Horizontal align="center">
                <pre className="dd-privacy-mask flex-grow overflow-x-auto rounded bg-muted-background p-2 font-mono">
                  {latestKey?.secret}
                </pre>
                <Button
                  tooltip={t`Copy to clipboard`}
                  icon={isCopiedApiKey ? ClipboardCheck : Clipboard}
                  onClick={async () => {
                    if (latestKey?.secret) {
                      await copyApiKey(latestKey.secret);
                    }
                  }}
                  variant="ghost-secondary"
                />
              </Page.Horizontal>
            </div>
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
};
