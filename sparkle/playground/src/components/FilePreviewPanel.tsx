import {
  Download01,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  LinkExternal01,
  Icon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import type { DataSource } from "../data/types";

interface FilePreviewPanelProps {
  dataSource: DataSource;
  variant?: "chrome" | "document";
}

function DocumentPreviewContent() {
  return (
    <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-items-center s-justify-center s-rounded-2xl s-border s-border-border s-bg-muted-background dark:s-border-border-night dark:s-bg-muted-background-night">
      <p className="s-text-foreground dark:s-text-foreground-night">
        Document Preview
      </p>
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
      <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-items-center s-justify-center s-bg-muted-background dark:s-bg-muted-background-night">
        <p className="s-text-foreground dark:s-text-foreground-night">
          Document Preview
        </p>
      </div>
    );
  }

  return (
    <div className="s-flex s-h-full s-min-h-0 s-flex-col s-gap-4">
      <div className="s-flex s-flex-col s-gap-4">
        <div className="s-flex s-items-center s-gap-2">
          {dataSource.icon ? <Icon visual={dataSource.icon} size="md" /> : null}
          <span className="s-heading-base s-text-foreground dark:s-text-foreground-night">
            {dataSource.fileName}
          </span>
        </div>
        <div className="s-flex s-w-full s-items-center s-gap-2">
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
          <div className="s-flex-1" />
          <div className="s-flex s-items-center s-gap-2">
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
      <div className="s-flex s-flex-1 s-flex-col">
        {documentView === "preview" ? (
          <DocumentPreviewContent />
        ) : (
          <div className="s-flex s-flex-1 s-flex-col s-items-center s-justify-center s-rounded-2xl s-border s-border-border s-bg-muted-background s-py-16 dark:s-border-border-night dark:s-bg-muted-background-night">
            <p className="s-text-foreground dark:s-text-foreground-night">
              Extracted information
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
