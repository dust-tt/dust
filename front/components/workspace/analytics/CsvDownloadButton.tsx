import type { ButtonProps } from "@dust-tt/sparkle";
import { Button, Download01 } from "@dust-tt/sparkle";

interface CsvDownloadButtonProps {
  isDownloading: boolean;
  disabled: boolean;
  handleDownload: () => void;
  label?: string;
  size?: ButtonProps["size"];
}

export function CsvDownloadButton({
  isDownloading,
  disabled,
  handleDownload,
  label,
  size,
}: CsvDownloadButtonProps) {
  return (
    <Button
      icon={label ? undefined : Download01}
      iconRight={label ? Download01 : undefined}
      label={label}
      variant="outline"
      size={size ?? (label ? "sm" : "xs")}
      tooltip={label ? undefined : "Download CSV"}
      onClick={handleDownload}
      disabled={disabled}
      isLoading={isDownloading}
    />
  );
}
