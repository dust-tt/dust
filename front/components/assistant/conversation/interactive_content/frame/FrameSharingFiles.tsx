import type { ShareFrameViewerFile } from "@app/lib/api/viz/share_frame_viewer_files";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  Button,
  ContentMessage,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Icon,
  ListItem,
} from "@dust-tt/sparkle";

interface FrameSharingFilesProps {
  viewerFiles: ShareFrameViewerFile[];
}

const SOURCE_LABELS: Record<ShareFrameViewerFile["sourceKind"], string> = {
  conversation: "Conversation",
  pod: "Pod",
  workspace: "Workspace",
};

/**
 * @cc [owner:flvndvd,label:product] shared-files-notice
 * Keep the sharing notice in the popover when the file dialog is closed.
 */
export function FrameSharingFiles({ viewerFiles }: FrameSharingFilesProps) {
  if (viewerFiles.length === 0) {
    return null;
  }

  return (
    <ContentMessage
      title="Files and data are shared too"
      variant="primary"
      size="sm"
    >
      <p>
        Viewers can access the files and data used by this frame. Sharing does
        not grant access to the rest of the conversation or pod.
      </p>
      <Dialog>
        <div className="mt-2">
          <DialogTrigger asChild>
            <Button
              label={`View ${viewerFiles.length} ${viewerFiles.length === 1 ? "file" : "files"}`}
              variant="ghost-secondary"
              size="sm"
            />
          </DialogTrigger>
        </div>
        <DialogContent size="md" preventAutoFocusOnClose={false}>
          <DialogHeader hideButton>
            <DialogTitle>Included files</DialogTitle>
            <DialogDescription>
              Files and data available to people you share this frame with.
            </DialogDescription>
          </DialogHeader>
          <div
            role="region"
            aria-label="Included file list"
            tabIndex={0}
            className="min-h-0 overflow-y-auto px-5 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-highlight-300"
          >
            <ul aria-label="Included files">
              {viewerFiles.map((viewerFile) => (
                <li key={viewerFile.ref}>
                  <ListItem
                    className="gap-2 px-0 py-2"
                    itemsAlignment="start"
                    hasSeparator={false}
                  >
                    <span aria-hidden="true" className="mt-0.5 shrink-0">
                      <Icon
                        visual={getFileTypeIcon(
                          viewerFile.contentType,
                          viewerFile.name
                        )}
                        size="xs"
                        className="text-muted-foreground"
                      />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 wrap-anywhere">
                      <span className="text-sm font-medium text-foreground">
                        {viewerFile.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {SOURCE_LABELS[viewerFile.sourceKind]} ·{" "}
                        {viewerFile.sourceName}
                      </span>
                      {viewerFile.pathInSource && (
                        <span className="text-xs text-muted-foreground">
                          /{viewerFile.pathInSource}
                        </span>
                      )}
                    </div>
                  </ListItem>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter
            rightButtonProps={{ label: "Close", variant: "outline" }}
          />
        </DialogContent>
      </Dialog>
    </ContentMessage>
  );
}
