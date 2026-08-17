import { Button, Download01 } from "@dust-tt/sparkle";

interface CsvDownloadButtonProps {
  isDownloading: boolean;
  disabled: boolean;
  handleDownload: () => void;
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
      icon={label ? undefined : Download01}
      iconRight={label ? Download01 : undefined}
      label={label}
      variant="outline"
      size={label ? "sm" : "xs"}
      tooltip={label ? undefined : "Download CSV"}
      onClick={handleDownload}
      disabled={disabled}
      isLoading={isDownloading}
    />
  );
}
