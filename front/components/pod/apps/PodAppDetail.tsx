import type { PodApp, PodAppFrame } from "@app/types/api/pod_apps";
import {
  Button,
  Chip,
  ContentMessage,
  Eye,
  ScrollArea,
} from "@dust-tt/sparkle";

interface PodAppDetailProps {
  app: PodApp;
  onOpenFrame: (frame: PodAppFrame) => void;
}

interface DetailSectionProps {
  title: string;
  children: React.ReactNode;
}

function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label-xs uppercase text-muted-foreground dark:text-muted-foreground-night">
        {title}
      </span>
      {children}
    </div>
  );
}

interface EmptySectionTextProps {
  children: React.ReactNode;
}

function EmptySectionText({ children }: EmptySectionTextProps) {
  return (
    <span className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
      {children}
    </span>
  );
}

export function PodAppDetail({ app, onOpenFrame }: PodAppDetailProps) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 px-6 py-5">
        <div className="flex flex-col gap-1">
          <h3 className="heading-lg">{app.name ?? "Unfiled"}</h3>
          <span className="copy-xs text-muted-foreground dark:text-muted-foreground-night">
            {app.folderPath ??
              "Published from the Pod root, so these are not owned by an app folder."}
          </span>
        </div>

        {app.collidingFolderNames.length > 0 && (
          <ContentMessage variant="warning" title="Colliding app folders">
            {app.collidingFolderNames.join(", ")} all resolve to the same app
            name (<span className="font-mono">{app.prefix}</span>), so they
            share these published functions and databases. Rename all but one,
            then re-publish its functions.
          </ContentMessage>
        )}

        <DetailSection title="Frames">
          {app.frames.length === 0 ? (
            <EmptySectionText>No Frame in this app.</EmptySectionText>
          ) : (
            <div className="flex flex-col gap-1">
              {app.frames.map((frame) => (
                <div key={frame.path} className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    icon={Eye}
                    label={frame.fileName}
                    // A Frame source with no FileResource row has no content to render.
                    disabled={!frame.fileId}
                    tooltip={
                      frame.fileId
                        ? "Open Frame"
                        : "This Frame cannot be opened"
                    }
                    onClick={() => onOpenFrame(frame)}
                  />
                  {frame.isPublished ? (
                    <Chip size="xs" color="success" label="Published" />
                  ) : (
                    <Chip size="xs" color="primary" label="Not published" />
                  )}
                  {frame.isPinnedAsTab && (
                    <Chip size="xs" color="info" label="Pinned as tab" />
                  )}
                </div>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title="Functions">
          {app.functions.length === 0 ? (
            <EmptySectionText>No published function.</EmptySectionText>
          ) : (
            <div className="flex flex-col gap-2">
              {app.functions.map((fn) => (
                <div key={fn.slug} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="copy-sm font-mono">{fn.name}</span>
                    <Chip size="xs" color="primary" label={fn.executionMode} />
                  </div>
                  <span className="copy-xs text-muted-foreground dark:text-muted-foreground-night">
                    {fn.description}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title="Databases">
          {app.databases.length === 0 ? (
            <EmptySectionText>No database.</EmptySectionText>
          ) : (
            <div className="flex flex-wrap gap-2">
              {app.databases.map((db) => (
                <span key={db.onDiskName} className="copy-sm font-mono">
                  {db.name}
                </span>
              ))}
            </div>
          )}
        </DetailSection>
      </div>
    </ScrollArea>
  );
}
