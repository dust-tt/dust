import { ArrowDownOnSquareIcon, Button } from "@dust-tt/sparkle";

interface CsvDownloadButtonProps {
  showExport: boolean;
  isDownloading: boolean;
  disabled: boolean;
  handleDownload: () => void;
}

export function CsvDownloadButton({
  showExport,
  isDownloading,
  disabled,
  handleDownload,
}: CsvDownloadButtonProps) {
  if (!showExport) {
    return null;
  }

  return (
    <Button
      icon={ArrowDownOnSquareIcon}
      variant="outline"
      size="xs"
      tooltip="Download CSV"
      onClick={handleDownload}
      disabled={disabled}
      isLoading={isDownloading}
    />
  );
}
