import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { usePokeFileDetails } from "@app/poke/swr/frame_details";
import { dateToHumanReadable } from "@app/types/shared/utils/date_utils";
import {
  Button,
  Chip,
  Clipboard,
  ClipboardCheck,
  CodeBlock,
  LinkExternal01,
  Page,
  Spinner,
  useCopyToClipboard,
} from "@dust-tt/sparkle";

export function FramePage() {
  const owner = useWorkspace();

  const sId = useRequiredPathParam("sId");
  const {
    file,
    content,
    shareInfo,
    sharingGrants,
    isFileLoading,
    isFileError,
  } = usePokeFileDetails({
    owner,
    sId,
  });

  usePokePageMetadata({
    name: file?.fileName,
    subtitle: owner.name,
    sId,
  });

  const [isCopiedContent, copyContent] = useCopyToClipboard();
  const [isCopiedMetadata, copyMetadata] = useCopyToClipboard();
  const [isCopiedShareUrl, copyShareUrl] = useCopyToClipboard();

  if (isFileLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isFileError || !file) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <div className="text-lg font-medium text-red-600">
          Failed to load file
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          The file may not exist or there was an error fetching it.
        </div>
      </div>
    );
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Page.Vertical align="stretch" gap="lg">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">
            File Details (Interactive Content)
          </h1>
          <div className="text-sm text-muted-foreground">
            File ID: <code className="text-xs">{file.sId}</code>
          </div>
        </div>

        {/* Summary Chips */}
        <div className="flex flex-wrap gap-2">
          <Chip
            color={file.status === "ready" ? "green" : "warning"}
            label={`Status: ${file.status}`}
            size="sm"
          />
          <Chip color="info" label={`Version: ${file.version}`} size="sm" />
          <Chip
            color="primary"
            label={`Size: ${formatFileSize(file.fileSize)}`}
            size="sm"
          />
        </div>

        {/* Metadata Card */}
        <div className="rounded-lg border">
          <div className="rounded-t-lg border-b bg-muted px-4 py-2 dark:bg-muted-background-night">
            <h3 className="font-medium">File Metadata</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 p-4">
            <div>
              <div className="text-sm text-muted-foreground">File ID</div>
              <div className="font-mono text-sm">{file.sId}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">File Name</div>
              <div className="font-mono text-sm">{file.fileName}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Content Type</div>
              <div className="font-mono text-sm">{file.contentType}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Use Case</div>
              <div className="font-mono text-sm">{file.useCase}</div>
            </div>
            {file.useCaseMetadata?.conversationId && (
              <div className="col-span-2">
                <div className="text-sm text-muted-foreground">
                  Conversation
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">
                    {file.useCaseMetadata.conversationId}
                  </span>
                  <Button
                    label="View"
                    variant="ghost"
                    size="xs"
                    icon={LinkExternal01}
                    href={`/poke/${owner.sId}/conversation/${file.useCaseMetadata.conversationId}`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Use Case Metadata Card */}
        {file.useCaseMetadata &&
          Object.keys(file.useCaseMetadata).length > 0 && (
            <div className="rounded-lg border">
              <div className="flex items-center justify-between rounded-t-lg border-b bg-muted px-4 py-2 dark:bg-muted-background-night">
                <h3 className="font-medium">Use Case Metadata</h3>
                <Button
                  label={isCopiedMetadata ? "Copied!" : "Copy"}
                  variant="ghost"
                  size="xs"
                  icon={isCopiedMetadata ? ClipboardCheck : Clipboard}
                  onClick={() =>
                    copyMetadata(JSON.stringify(file.useCaseMetadata, null, 2))
                  }
                />
              </div>
              <div className="p-4">
                <CodeBlock
                  wrapLongLines
                  className="language-json max-h-48 overflow-auto"
                >
                  {JSON.stringify(file.useCaseMetadata, null, 2)}
                </CodeBlock>
              </div>
            </div>
          )}

        {/* Sharing Settings Card */}
        <div className="rounded-lg border">
          <div className="rounded-t-lg border-b bg-muted px-4 py-2 dark:bg-muted-background-night">
            <h3 className="font-medium">Sharing Settings</h3>
          </div>
          <div className="p-4">
            {shareInfo ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Share Scope
                    </div>
                    <div className="font-mono text-sm">{shareInfo.scope}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Shared At
                    </div>
                    <div className="font-mono text-sm">
                      {dateToHumanReadable(new Date(shareInfo.sharedAt))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm text-muted-foreground">
                      Share URL
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-xs">
                        {shareInfo.shareUrl}
                      </span>
                      <Button
                        label={isCopiedShareUrl ? "Copied!" : "Copy"}
                        variant="ghost"
                        size="xs"
                        icon={isCopiedShareUrl ? ClipboardCheck : Clipboard}
                        onClick={() => copyShareUrl(shareInfo.shareUrl)}
                      />
                    </div>
                  </div>
                </div>
                {(() => {
                  const activeGrants = sharingGrants.filter(
                    (g) => !g.revokedAt
                  );
                  const revokedGrants = sharingGrants.filter(
                    (g) => g.revokedAt
                  );
                  return (
                    <>
                      <div>
                        <div className="mb-2 text-sm text-muted-foreground">
                          Active Grants ({activeGrants.length})
                        </div>
                        {activeGrants.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {activeGrants.map((grant) => (
                              <div
                                key={grant.id}
                                className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                              >
                                <span className="font-mono">{grant.email}</span>
                                <div className="flex items-center gap-3 text-muted-foreground">
                                  {grant.blockedByPolicy && (
                                    <Chip
                                      color="warning"
                                      label="Blocked by policy"
                                      size="xs"
                                    />
                                  )}
                                  <span className="text-xs">
                                    Granted{" "}
                                    {dateToHumanReadable(
                                      new Date(grant.grantedAt)
                                    )}
                                  </span>
                                  {grant.grantedBy && (
                                    <span className="text-xs">
                                      by {grant.grantedBy.fullName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            No active grants.
                          </div>
                        )}
                      </div>
                      {revokedGrants.length > 0 && (
                        <div>
                          <div className="mb-2 text-sm text-muted-foreground">
                            Revoked Grants ({revokedGrants.length})
                          </div>
                          <div className="flex flex-col gap-2">
                            {revokedGrants.map((grant) => (
                              <div
                                key={grant.id}
                                className="flex items-center justify-between rounded border px-3 py-2 text-sm opacity-60"
                              >
                                <span className="font-mono line-through">
                                  {grant.email}
                                </span>
                                <div className="flex items-center gap-3 text-muted-foreground">
                                  <Chip
                                    color="primary"
                                    label="Revoked"
                                    size="xs"
                                  />
                                  <span className="text-xs">
                                    Revoked{" "}
                                    {dateToHumanReadable(
                                      new Date(grant.revokedAt!)
                                    )}
                                  </span>
                                  <span className="text-xs">
                                    Granted{" "}
                                    {dateToHumanReadable(
                                      new Date(grant.grantedAt)
                                    )}
                                  </span>
                                  {grant.grantedBy && (
                                    <span className="text-xs">
                                      by {grant.grantedBy.fullName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No sharing configured.
              </div>
            )}
          </div>
        </div>

        {/* Content Card */}
        {content && (
          <div className="rounded-lg border">
            <div className="flex items-center justify-between rounded-t-lg border-b bg-muted px-4 py-2 dark:bg-muted-background-night">
              <h3 className="font-medium">File Content</h3>
              <Button
                label={isCopiedContent ? "Copied!" : "Copy Content"}
                variant="ghost"
                size="xs"
                icon={isCopiedContent ? ClipboardCheck : Clipboard}
                onClick={() => copyContent(content)}
              />
            </div>
            <div className="p-4">
              <CodeBlock
                wrapLongLines
                className="language-tsx max-h-96 overflow-auto"
              >
                {content}
              </CodeBlock>
            </div>
          </div>
        )}
      </Page.Vertical>
    </div>
  );
}
