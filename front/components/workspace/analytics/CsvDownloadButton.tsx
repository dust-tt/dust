import type { ButtonProps } from "@dust-tt/sparkle";
import { Button, Download01 } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
  return (
    <Button
      icon={label ? undefined : Download01}
      iconRight={label ? Download01 : undefined}
      {...(label ? { label } : { tooltip: t`Download CSV` })}
      variant="outline"
      size={size ?? (label ? "sm" : "xs")}
      onClick={handleDownload}
      disabled={disabled}
      isLoading={isDownloading}
    />
  );
}
