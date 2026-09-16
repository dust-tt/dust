import type { ShareFrameViewerFile } from "@app/lib/api/viz/share_frame_viewer_files";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
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
 * Keep the sharing notice visible while the file list is collapsed.
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
      <Collapsible>
        <div className="mt-2 rounded-lg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
          <CollapsibleTrigger>
            <span className="flex min-h-8 items-center text-xs font-medium">
              {viewerFiles.length} included{" "}
              {viewerFiles.length === 1 ? "file" : "files"}
            </span>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
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
        </CollapsibleContent>
      </Collapsible>
    </ContentMessage>
  );
}
