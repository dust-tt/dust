import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useCallback, useState } from "react";

interface UseDownloadCsvOptions {
  url: string;
  filename: string;
  disabled?: boolean;
}

export function useDownloadCsv({
  url,
  filename,
  disabled,
}: UseDownloadCsvOptions) {
  const { hasFeature } = useFeatureFlags();
  const showExport = hasFeature("analytics_csv_export");
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const response = await clientFetch(url);
      if (!response.ok) {
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setIsDownloading(false);
    }
  }, [url, filename]);

  return {
    showExport,
    isDownloading,
    disabled: !!disabled,
    handleDownload,
  };
}
