import { Button } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { UploadPreview } from "./UploadPreview";

export function StagedFiles({
  files,
  children,
  onCancel,
  busy = false,
  error,
}: {
  files: File[];
  children: ReactNode;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
}) {
  return (
    <section
      aria-label="Pending files"
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {files.length} {files.length === 1 ? "file" : "files"}
          {" ready to upload"}
        </p>
      </div>
      <UploadPreview files={files} />
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Button
          label="Cancel"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
