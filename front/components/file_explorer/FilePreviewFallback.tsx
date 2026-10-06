import { Button, Download01 } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-8">
      <p className="text-center text-sm text-muted-foreground">{message}</p>
      {download && (
        <Button
          variant="outline"
          size="sm"
          icon={Download01}
          label={t`Download`}
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
