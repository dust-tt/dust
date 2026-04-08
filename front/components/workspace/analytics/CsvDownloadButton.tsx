import { ArrowDownOnSquareIcon, Button } from "@dust-tt/sparkle";

interface CsvDownloadButtonProps {
  isDownloading: boolean;
  disabled: boolean;
  handleDownload: () => void;
}

export function CsvDownloadButton({
  isDownloading,
  disabled,
  handleDownload,
}: CsvDownloadButtonProps) {
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
