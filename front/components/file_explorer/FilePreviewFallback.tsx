import { Button, Download01 } from "@dust-tt/sparkle";

export type FilePreviewDownloadAction =
  | { href: string }
  | { onClick: () => void; isLoading?: boolean };

interface FilePreviewFallbackProps {
  download?: FilePreviewDownloadAction;
  message: string;
}

export function FilePreviewFallback({
  download,
  message,
}: FilePreviewFallbackProps) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-8">
      <p className="text-center text-sm text-muted-foreground">{message}</p>
      {download && (
        <Button
          variant="outline"
          size="sm"
          icon={Download01}
          label="Download"
          {...("href" in download
            ? {
                href: download.href,
                target: "_blank",
                rel: "noopener noreferrer",
              }
            : { onClick: download.onClick, isLoading: download.isLoading })}
        />
      )}
    </div>
  );
}
