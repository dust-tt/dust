import config from "@app/lib/api/config";
import { useExportFrameAsPdf } from "@app/lib/swr/frames";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { LightWorkspaceType } from "@app/types/user";
import { datadogLogs } from "@datadog/browser-logs";
import {
  Button,
  Download01,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type React from "react";
import { useState } from "react";

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
  const isMobile = useIsMobile();
  const exportAsPdf = useExportFrameAsPdf({ owner });
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const exportLabel = isExportingPdf ? "Exporting..." : "Export";

  const handleExportAsPng = () => {
    if (fileContent) {
      const imgRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
      if (imgRegex.test(fileContent)) {
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

  const handleExportAsPdf = async (orientation: "portrait" | "landscape") => {
    if (isExportingPdf) {
      return;
    }
    setIsExportingPdf(true);
    await exportAsPdf({ fileId, fileName, orientation });
    setIsExportingPdf(false);
  };

  const handleDownloadAsCode = () => {
    const downloadUrl = `${config.getApiBaseUrl()}/api/w/${owner.sId}/files/${fileId}?action=download`;
    window.open(downloadUrl, "_blank");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={Download01}
          isSelect
          label={isMobile ? undefined : exportLabel}
          tooltip={isMobile ? exportLabel : undefined}
          variant="ghost"
          disabled={isExportingPdf}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={isExportingPdf} label="PDF" />
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => handleExportAsPdf("portrait")}>
              Portrait
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportAsPdf("landscape")}>
              Landscape
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={handleExportAsPng}>PNG</DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownloadAsCode}>
          Template
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
