import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Download01,
  Edit04,
  Eye,
  File06,
  Icon,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import { useState } from "react";

import { getDataSourceIcon } from "../data/dataSources";
import type { DataSource, DataSourceFileType } from "../data/types";

interface FilePreviewPanelProps {
  dataSource: DataSource;
  variant?: "chrome" | "document";
}

type DocumentView = "preview" | "edit" | "extracted";

function isTextDocument(fileType: DataSourceFileType | undefined): boolean {
  return fileType === "txt" || fileType === "md";
}

function isDocumentView(value: string): value is DocumentView {
  return value === "preview" || value === "edit" || value === "extracted";
}

function DocumentPane({
  label,
  flush = false,
}: {
  label: string;
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col items-center justify-center bg-muted-background",
        !flush && "rounded-2xl border border"
      )}
    >
      <p className="text-foreground">{label}</p>
    </div>
  );
}

function getActiveView({
  documentView,
  isText,
}: {
  documentView: DocumentView;
  isText: boolean;
}): DocumentView {
  if (documentView === "preview") {
    return "preview";
  }

  if (isText) {
    return documentView === "edit" ? "edit" : "preview";
  }

  return documentView === "extracted" ? "extracted" : "preview";
}

function getPaneLabel(view: DocumentView): string {
  switch (view) {
    case "edit":
      return "Edit";
    case "extracted":
      return "Extracted";
    case "preview":
      return "Document Preview";
  }
}

export function FilePreviewPanel({
  dataSource,
  variant = "chrome",
}: FilePreviewPanelProps) {
  const [documentView, setDocumentView] = useState<DocumentView>("preview");
  const isFrame = dataSource.fileType === "frame";
  const isText = isTextDocument(dataSource.fileType);
  const activeView = getActiveView({ documentView, isText });
  const icon = getDataSourceIcon(dataSource);

  if (isFrame) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <DocumentPane label="Document Preview" flush />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col gap-4",
        variant === "document" && "p-4"
      )}
    >
      {variant === "chrome" ? (
        <div className="flex shrink-0 items-center gap-2">
          {icon ? <Icon visual={icon} size="md" /> : null}
          <span className="heading-base text-foreground">
            {dataSource.fileName}
          </span>
        </div>
      ) : null}
      <div className="flex w-full shrink-0 items-center gap-2">
        <ButtonsSwitchList
          value={activeView}
          size="sm"
          onValueChange={(nextValue) => {
            if (isDocumentView(nextValue)) {
              setDocumentView(nextValue);
            }
          }}
        >
          <ButtonsSwitch value="preview" label="Preview" icon={Eye} />
          {isText ? (
            <ButtonsSwitch value="edit" label="Edit" icon={Edit04} />
          ) : (
            <ButtonsSwitch value="extracted" label="Extracted" icon={File06} />
          )}
        </ButtonsSwitchList>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          icon={Download01}
          tooltip="Download"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <DocumentPane label={getPaneLabel(activeView)} />
      </div>
      {activeView === "edit" ? (
        <div className="flex shrink-0 justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            label="Cancel"
            onClick={() => setDocumentView("preview")}
          />
          <Button
            variant="highlight"
            size="sm"
            label="Save"
            onClick={() => setDocumentView("preview")}
          />
        </div>
      ) : null}
    </div>
  );
}
