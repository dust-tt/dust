import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types/user";
import { datadogLogs } from "@datadog/browser-logs";
import {
  ArrowDownOnSquareIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

interface ExportContentDropdownProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  owner: LightWorkspaceType;
  fileId: string;
  fileContent: string | null;
  fileName?: string;
}

export function ExportContentDropdown({
  iframeRef,
  owner,
  fileId,
  fileContent,
  fileName,
}: ExportContentDropdownProps) {
  const sendNotification = useSendNotification();
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const exportAsPng = () => {
    if (fileContent) {
      const imgRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
      if (imgRegex.test(fileContent)) {
        sendNotification({
          type: "error",
          title: "Cannot export as PNG",
          description:
            "Content contains images with external URLs, which are blocked for " +
            "security purposes. Please use images uploaded to the conversation instead.",
        });
        return;
      }
    }

    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: `EXPORT_PNG` }, "*");
    } else {
      datadogLogs.logger.info(
        "Failed to export content as PNG: No iframe content window found"
      );
    }
  };

  const exportAsPdf = async (orientation: "portrait" | "landscape") => {
    if (isExportingPdf) {
      return;
    }

    setIsExportingPdf(true);
    try {
      const response = await clientFetch(
        `/api/w/${owner.sId}/files/${fileId}/export/pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orientation }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName?.replace(/\.[^.]+$/, ".pdf") ?? "frame.pdf";
      link.click();
      URL.revokeObjectURL(url);

      sendNotification({
        title: "PDF exported",
        type: "success",
        description: "Your PDF has been downloaded.",
      });
    } catch {
      sendNotification({
        title: "PDF Export Failed",
        type: "error",
        description: "An error occurred while generating the PDF.",
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const downloadAsCode = () => {
    const downloadUrl = `${config.getApiBaseUrl()}/api/w/${owner.sId}/files/${fileId}?action=download`;
    window.open(downloadUrl, "_blank");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={ArrowDownOnSquareIcon}
          isSelect
          label={isExportingPdf ? "Exporting..." : "Export"}
          variant="ghost"
          disabled={isExportingPdf}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={isExportingPdf} label="PDF" />
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => exportAsPdf("portrait")}>
              Portrait
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAsPdf("landscape")}>
              Landscape
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={exportAsPng}>PNG</DropdownMenuItem>
        <DropdownMenuItem onClick={downloadAsCode}>Template</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
