import { clientFetch } from "@app/lib/egress/client";
import { useCallback, useState } from "react";

interface UseDownloadCsvOptions {
  url: string;
  filename: string;
  disabled?: boolean;
  // Some exports carry a filter too large to fit in a URL, so the request
  // body must travel as JSON over POST instead of a GET query string.
  body?: unknown;
}

export function useDownloadCsv({
  url,
  filename,
  disabled,
  body,
}: UseDownloadCsvOptions) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const response = await clientFetch(
        url,
        body === undefined
          ? undefined
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
      );
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
  }, [url, filename, body]);

  return {
    isDownloading,
    disabled: !!disabled,
    handleDownload,
  };
}
