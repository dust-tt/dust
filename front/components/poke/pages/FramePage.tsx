import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeFileDetails } from "@app/poke/swr/frame_details";
import {
  Button,
  Chip,
  ClipboardCheckIcon,
  ClipboardIcon,
  CodeBlock,
  ExternalLinkIcon,
  Page,
  Spinner,
  useCopyToClipboard,
} from "@dust-tt/sparkle";

export function FramePage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - File`);

  const sId = useRequiredPathParam("sId");
  const { file, content, isFileLoading, isFileError } = usePokeFileDetails({
    owner,
    sId,
  });

  const [isCopiedContent, copyContent] = useCopyToClipboard();
  const [isCopiedMetadata, copyMetadata] = useCopyToClipboard();

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
          <div className="rounded-t-lg border-b bg-muted px-4 py-2">
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
                    icon={ExternalLinkIcon}
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
              <div className="flex items-center justify-between rounded-t-lg border-b bg-muted px-4 py-2">
                <h3 className="font-medium">Use Case Metadata</h3>
                <Button
                  label={isCopiedMetadata ? "Copied!" : "Copy"}
                  variant="ghost"
                  size="xs"
                  icon={isCopiedMetadata ? ClipboardCheckIcon : ClipboardIcon}
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

        {/* Content Card */}
        {content && (
          <div className="rounded-lg border">
            <div className="flex items-center justify-between rounded-t-lg border-b bg-muted px-4 py-2">
              <h3 className="font-medium">File Content</h3>
              <Button
                label={isCopiedContent ? "Copied!" : "Copy Content"}
                variant="ghost"
                size="xs"
                icon={isCopiedContent ? ClipboardCheckIcon : ClipboardIcon}
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
