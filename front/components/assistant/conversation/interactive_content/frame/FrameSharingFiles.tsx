import type { ShareFrameViewerFile } from "@app/lib/api/viz/share_frame_viewer_files";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  ContentMessage,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Hoverable,
  Icon,
  ListItem,
} from "@dust-tt/sparkle";

interface FrameSharingFilesProps {
  viewerFiles: ShareFrameViewerFile[];
}

const SOURCE_LABELS: Record<ShareFrameViewerFile["sourceKind"], string> = {
  frame: "Frame",
  conversation: "Conversation",
  pod: "Pod",
  workspace: "Workspace",
};

export function FrameSharingFiles({ viewerFiles }: FrameSharingFilesProps) {
  if (viewerFiles.length === 0) {
    return null;
  }

  return (
    <ContentMessage
      title="Files and data used by this frame are shared too"
      variant="blue"
      size="sm"
    >
      <p>
        People who can view this frame can also access the files and data it
        uses. They can’t access the rest of the conversation or pod.
      </p>
      <Dialog>
        <div className="mt-2">
          <Hoverable variant="highlight" asChild>
            <DialogTrigger>
              View {viewerFiles.length}{" "}
              {viewerFiles.length === 1 ? "file" : "files"}
            </DialogTrigger>
          </Hoverable>
        </div>
        <DialogContent
          size="lg"
          className="max-h-[min(40rem,90dvh)]"
          preventAutoFocusOnClose={false}
        >
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
