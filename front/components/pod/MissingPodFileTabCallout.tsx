import { getScopedRelativePath } from "@app/components/file_explorer/utils";
import { AlertCircle, ContentMessage } from "@dust-tt/sparkle";

interface MissingPodFileTabCalloutProps {
  path: string;
  /** Prefer "frame" when the missing tab was expected to be a Frame. */
  kind?: "file" | "frame";
}

export function MissingPodFileTabCallout({
  path,
  kind = "file",
}: MissingPodFileTabCalloutProps) {
  const relativePath = getScopedRelativePath(path);

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <ContentMessage
        variant="warning"
        icon={AlertCircle}
        size="lg"
        title={`${kind === "frame" ? "Frame" : "File"} no longer available`}
        className="max-w-md"
      >
        This {kind} is missing or was renamed in Pod files ({relativePath}).
        Remove it from Tabs in Settings, or restore the file.
      </ContentMessage>
    </div>
  );
}
