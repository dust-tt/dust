import { CacheDataAPI } from "@viz/app/lib/data-apis/cache-data-api";
import type { FrameDocumentFiles } from "@viz/app/types";
import { DocumentFilesProvider } from "@viz/components/dust/document/DocumentFilesProvider";
import { useState } from "react";
import { DocumentRoot } from "../DocumentRoot";
import { RevenueChart } from "./RevenueChart";
import document from "./report.json";
import themes from "./theme.json";

export class DocumentDemoAPI extends CacheDataAPI {
  source = JSON.stringify(document);
  revision = "1";
  writes = 0;
  rejectSaves = false;
  setDocumentPendingChanges = async (_pending: boolean) => {};
  documentFiles: FrameDocumentFiles = {
    load: async () => ({
      ok: true,
      value: { source: this.source, revision: this.revision, canEdit: true },
    }),
    save: async ({ source, revision }) => {
      if (this.rejectSaves || revision !== this.revision) {
        return {
          ok: false,
          error: "This document changed elsewhere. Your draft has been kept.",
        };
      }
      this.source = source;
      this.revision = String(Number(this.revision) + 1);
      this.writes += 1;
      return { ok: true, value: { revision: this.revision } };
    },
  };
}

interface DocumentRootDemoProps {
  readOnly?: boolean;
  conflict?: boolean;
  invalidTheme?: boolean;
  missingVisual?: boolean;
}

export const DocumentRootDemo = ({
  readOnly,
  conflict,
  invalidTheme,
  missingVisual,
}: DocumentRootDemoProps) => {
  const [api] = useState(() =>
    readOnly
      ? new CacheDataAPI([
          {
            fileId: "./report.dustdoc",
            mimeType: "application/json",
            data: btoa(
              Array.from(
                new TextEncoder().encode(JSON.stringify(document)),
                (byte) => String.fromCharCode(byte)
              ).join("")
            ),
          },
        ])
      : Object.assign(new DocumentDemoAPI(), { rejectSaves: conflict ?? false })
  );
  const [theme, setTheme] = useState<keyof typeof themes>("Editorial");
  const [session, setSession] = useState(0);
  const reopen = () => setSession((value) => value + 1);
  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav
        aria-label="Document theme"
        className="flex flex-wrap items-center justify-center gap-2 border-b border-border p-4"
      >
        <button
          type="button"
          aria-pressed={theme === "Editorial"}
          onClick={() => setTheme("Editorial")}
          className="rounded-lg border border-border px-4 py-2 text-sm"
        >
          Editorial
        </button>
        <button
          type="button"
          aria-pressed={theme === "Business"}
          onClick={() => setTheme("Business")}
          className="rounded-lg border border-border px-4 py-2 text-sm"
        >
          Business
        </button>
        <button
          type="button"
          aria-pressed={theme === "Technical"}
          onClick={() => setTheme("Technical")}
          className="rounded-lg border border-border px-4 py-2 text-sm"
        >
          Technical
        </button>
        <button
          type="button"
          onClick={reopen}
          className="rounded-lg border border-border px-4 py-2 text-sm"
        >
          Reopen document
        </button>
      </nav>
      <DocumentFilesProvider dataAPI={api} key={session}>
        <DocumentRoot
          src="./report.dustdoc"
          theme={invalidTheme ? { bodySize: -1 } : themes[theme]}
          visuals={missingVisual ? {} : { revenue: <RevenueChart /> }}
        />
      </DocumentFilesProvider>
    </main>
  );
};
