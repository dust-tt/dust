import { Button, Download01 } from "@dust-tt/sparkle";

interface CsvDownloadButtonProps {
  isDownloading: boolean;
  disabled: boolean;
  handleDownload: () => void;
  // Icon-only by default (existing analytics charts/tables); pass a label
  // where the button isn't next to other obvious export context.
  label?: string;
}

export function CsvDownloadButton({
  isDownloading,
  disabled,
  handleDownload,
  label,
}: CsvDownloadButtonProps) {
  return (
    <Button
      icon={Download01}
      label={label}
      variant="outline"
      size="xs"
      tooltip={label ? undefined : "Download CSV"}
      onClick={handleDownload}
      disabled={disabled}
      isLoading={isDownloading}
    />
  );
}
