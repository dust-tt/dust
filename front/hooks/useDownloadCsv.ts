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

// The server knows things the client doesn't when it names the attachment
// (e.g. the actual resolved billing cycle date), so prefer its
// Content-Disposition filename and fall back to the caller's name only if
// it didn't set one.
function filenameFromContentDisposition(
  contentDisposition: string | null
): string | null {
  const match = contentDisposition?.match(/filename="([^"]+)"/);
  return match ? match[1] : null;
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
      a.download =
        filenameFromContentDisposition(
          response.headers.get("Content-Disposition")
        ) ?? filename;
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
