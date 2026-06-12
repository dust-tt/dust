import { useRef, useState } from "react";

import { Button, Input } from "@dust-tt/sparkle";
import { ArrowUpOnSquareIcon, DocumentTextIcon, GlobeAltIcon, LockIcon, TableIcon } from "@dust-tt/sparkle";

import { HOSTILE_SAMPLES, SAMPLES, type Sample } from "../samples";
import type { SheetSource } from "../source";

interface SidebarProps {
  current: SheetSource | null;
  onOpen: (source: SheetSource) => void;
}

function SampleList({
  samples,
  current,
  onOpen,
  icon: ItemIcon,
}: {
  samples: Sample[];
  current: SheetSource | null;
  onOpen: (source: SheetSource) => void;
  icon: typeof TableIcon;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {samples.map((sample) => {
        const active = current?.kind === "sample" && current.fileName === sample.fileName;
        return (
          <button
            key={sample.fileName}
            type="button"
            onClick={() => onOpen({ kind: "sample", fileName: sample.fileName, src: { url: sample.url } })}
            className={`group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
              active ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <ItemIcon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{sample.fileName}</span>
              <span className={`block truncate text-xs ${active ? "text-blue-600/80" : "text-slate-500"}`}>
                {sample.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Sidebar({ current, onOpen }: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");

  const openFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      return;
    }
    void file.arrayBuffer().then((bytes) => {
      onOpen({ kind: "file", fileName: file.name, src: { bytes } });
    });
  };

  const openUrl = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }
    const fileName = trimmed.split("/").pop()?.split("?")[0] || "workbook.xlsx";
    onOpen({ kind: "url", fileName, src: { url: trimmed } });
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Open</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv,.tsv"
          className="hidden"
          onChange={(e) => {
            openFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          icon={ArrowUpOnSquareIcon}
          label="Open a local file"
          onClick={() => fileInputRef.current?.click()}
        />
        <div className="flex items-center gap-1.5">
          <Input
            placeholder="https://... .xlsx or .csv"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                openUrl();
              }
            }}
            className="text-sm"
          />
          <Button variant="outline" size="sm" icon={GlobeAltIcon} onClick={openUrl} tooltip="Fetch in the worker" />
        </div>
        <p className="px-1 text-xs text-slate-400">
          Files parse in a Web Worker; nothing leaves the browser.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Sample workbooks</h2>
        <SampleList samples={SAMPLES} current={current} onOpen={onOpen} icon={TableIcon} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Hostile files</h2>
        <p className="px-1 text-xs text-slate-400">
          Built to break parsers. The engine answers each with a typed error, or opens it defanged. It never
          crashes the tab.
        </p>
        <SampleList samples={HOSTILE_SAMPLES} current={current} onOpen={onOpen} icon={LockIcon} />
      </div>

      <div className="mt-auto flex flex-col gap-1 px-1 pt-2 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <DocumentTextIcon className="h-3.5 w-3.5" />
          Rust engine compiled to WASM (~245 KiB gzipped)
        </span>
        <span>Grid by @extend-ai/react-xlsx, unforked</span>
      </div>
    </aside>
  );
}
