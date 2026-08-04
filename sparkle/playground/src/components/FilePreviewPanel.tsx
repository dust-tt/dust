import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Download01,
  Icon,
  LinkExternal01,
} from "@dust-tt/sparkle";
import { useState } from "react";

import type { DataSource } from "../data/types";

interface FilePreviewPanelProps {
  dataSource: DataSource;
  variant?: "chrome" | "document";
}

function DocumentPreviewContent() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border bg-muted-background">
      <p className="text-foreground">Document Preview</p>
    </div>
  );
}

export function FilePreviewPanel({
  dataSource,
  variant = "chrome",
}: FilePreviewPanelProps) {
  const [documentView, setDocumentView] = useState<"preview" | "extracted">(
    "preview"
  );

  if (variant === "document") {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center bg-muted-background">
        <p className="text-foreground">Document Preview</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {dataSource.icon ? <Icon visual={dataSource.icon} size="md" /> : null}
          <span className="heading-base text-foreground">
            {dataSource.fileName}
          </span>
        </div>
        <div className="flex w-full items-center gap-2">
          <ButtonsSwitchList
            defaultValue="preview"
            size="xs"
            onValueChange={(nextValue) => {
              if (nextValue === "preview" || nextValue === "extracted") {
                setDocumentView(nextValue);
              }
            }}
          >
            <ButtonsSwitch value="preview" label="Preview" />
            <ButtonsSwitch value="extracted" label="Extracted information" />
          </ButtonsSwitchList>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-xs"
              icon={Download01}
              tooltip="Download"
            />
            <Button
              variant="outline"
              size="icon-xs"
              icon={LinkExternal01}
              tooltip="Open in tab"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        {documentView === "preview" ? (
          <DocumentPreviewContent />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border bg-muted-background py-16">
            <p className="text-foreground">Extracted information</p>
          </div>
        )}
      </div>
    </div>
  );
}
