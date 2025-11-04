import { useState, useMemo } from "react";
import { Runner } from "react-runner";
import React from "react";

interface PreFetchedFile {
  fileId: string;
  data: string; // base64
  mimeType: string;
}

export function ClientFrameRenderer({
  code,
  preFetchedFiles,
}: {
  code: string;
  preFetchedFiles: PreFetchedFile[];
}) {
  // Convert pre-fetched files to File objects.
  const fileCache = useMemo(() => {
    const cache = new Map<string, File>();

    preFetchedFiles.forEach(({ fileId, data, mimeType }) => {
      try {
        // Convert base64 to Blob.
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType });
        const file = new File([blob], fileId, { type: mimeType });
        cache.set(fileId, file);
      } catch (err) {
        console.error(`Failed to process file ${fileId}:`, err);
      }
    });

    return cache;
  }, [preFetchedFiles]);

  // Custom useFile that ONLY reads from cache (no RPC)
  const useFileFromCache = (fileId: string) => {
    const [file] = useState<File | null>(() => {
      const cached = fileCache.get(fileId);
      if (!cached) {
        console.error(`File ${fileId} not pre-fetched`);
        return null;
      }
      return cached;
    });
    return file;
  };

  console.log("Rendering ClientFrameRenderer with code:", code);

  const scope = {
    React,
    import: {
      react: React,
      "@dust/react-hooks": {
        useFile: useFileFromCache,
        triggerUserFileDownload: (opts: {
          content: Blob | string;
          filename: string;
        }) => {
          const blob =
            typeof opts.content === "string"
              ? new Blob([opts.content], { type: "text/plain" })
              : opts.content;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = opts.filename;
          a.click();
          URL.revokeObjectURL(url);
        },
      },
      // Add other imports as needed (recharts, shadcn, etc.)
      recharts: require("recharts"),
      "lucide-react": require("lucide-react"),
      shadcn: require("shadcn"),
      // ... etc
    },
  };

  return (
    <div className='w-full h-full bg-background'>
      <Runner code={code} scope={scope} />
    </div>
  );
}
