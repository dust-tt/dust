import "@uiw/react-textarea-code-editor/dist.css";

import {
  Button,
  ClipboardIcon,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

import type { DataSourceType, SpaceType, WorkspaceType } from "@app/types";
import { assertNever } from "@app/types";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

interface ViewFolderAPIModalProps {
  dataSource: DataSourceType;
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  space: SpaceType;
}

export function ViewFolderAPIModal({
  dataSource,
  isOpen,
  onClose,
  owner,
  space,
}: ViewFolderAPIModalProps) {
  const cURLRequest = (type: "upsert" | "search") => {
    switch (type) {
      case "upsert":
        return `curl "${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/api/v1/w/${owner.sId}/spaces/${space.sId}/data_sources/${dataSource.sId}/documents/YOUR_DOCUMENT_ID" \\
    -H "Authorization: Bearer YOUR_API_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{
      "text": "Lorem ipsum dolor sit amet...",
      "source_url": "https://acme.com"
    }'`;
      case "search":
        return `curl "${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/api/v1/w/${owner.sId}/spaces/${space.sId}/data_sources/${dataSource.sId}/search?query=foo+bar&top_k=16&full_text=false" \\
    -H "Authorization: Bearer YOUR_API_KEY"`;
      default:
        assertNever(type);
    }
  };

  const [copySearchButtonText, setCopySearchButtonText] = useState("Copy");
  const [copyUpsertButtonText, setCopyUpsertButtonText] = useState("Copy");

  // Copy the cURL request to the clipboard
  const handleCopyClick = async (type: "upsert" | "search") => {
    await navigator.clipboard.writeText(cURLRequest(type));

    switch (type) {
      case "upsert":
        setCopyUpsertButtonText("Copied!");
        setTimeout(() => {
          setCopyUpsertButtonText("Copy");
        }, 1500);
        break;
      case "search":
        setCopySearchButtonText("Copied!");
        setTimeout(() => {
          setCopySearchButtonText("Copy");
        }, 1500);
        break;
      default:
        assertNever(type);
    }
  };

  const theme = localStorage.getItem("theme");

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Data source API</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-6">
            <Page.P>
              <div className="rounded-lg bg-structure-50 p-4 shadow-sm">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-element-700">Space ID:</span>
                    <code className="rounded bg-white px-2 py-1 font-mono text-sm font-bold text-element-900 shadow-sm">
                      {space.sId}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-element-700">
                      Data Source ID:
                    </span>
                    <code className="rounded bg-white px-2 py-1 font-mono text-sm font-bold text-element-900 shadow-sm">
                      {dataSource.sId}
                    </code>
                  </div>
                </div>
              </div>
            </Page.P>

            <Page.Separator />

            <div>
              <Page.SectionHeader title="Upsert document" />
              <Page.P>
                Use the following cURL command to upsert a document to folder{" "}
                <span className="italic">{dataSource.name}</span>:
              </Page.P>
              <CodeEditor
                data-color-mode={theme === "dark" ? "dark" : "light"}
                readOnly={true}
                value={`$ ${cURLRequest("upsert")}`}
                language="shell"
                padding={15}
                className="mt-5 rounded-md bg-gray-700 px-4 py-4 font-mono text-[13px] text-white"
                style={{
                  fontSize: 13,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                  backgroundColor: "rgb(241 245 249)",
                  width: "100%",
                  marginTop: "0rem",
                }}
              />
              <div className="mt-2 flex w-full justify-end">
                <Button
                  variant="outline"
                  onClick={() => handleCopyClick("upsert")}
                  label={copyUpsertButtonText}
                  icon={ClipboardIcon}
                />
              </div>
            </div>

            <Page.Separator />

            <div>
              <Page.SectionHeader title="Search" />
              <Page.P>
                Use the following cURL command to search in folder{" "}
                <span className="italic">{dataSource.name}</span>:
              </Page.P>
              <CodeEditor
                data-color-mode={theme === "dark" ? "dark" : "light"}
                readOnly={true}
                value={`$ ${cURLRequest("search")}`}
                language="shell"
                padding={15}
                className="mt-5 rounded-md bg-gray-700 px-4 py-4 font-mono text-[13px] text-white"
                style={{
                  fontSize: 13,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                  backgroundColor: "rgb(241 245 249)",
                  width: "100%",
                  marginTop: "0rem",
                }}
              />
              <div className="mt-2 flex w-full justify-end">
                <Button
                  variant="outline"
                  onClick={() => handleCopyClick("search")}
                  label={copySearchButtonText}
                  icon={ClipboardIcon}
                />
              </div>
            </div>

            <Page.Separator />

            <div>
              <Page.SectionHeader title="API Keys" />
              <Page.P>
                <div className="pb-2">
                  {owner.role === "admin" ? (
                    <Link
                      href={`/w/${owner.sId}/developers/api-keys`}
                      className="py-1 font-bold text-action-600"
                    >
                      Manage workspace API keys
                    </Link>
                  ) : (
                    <span>API keys are managed by workspace admins.</span>
                  )}
                </div>
                <span>
                  Handle API keys with care as they provide access to your
                  company data.
                </span>
              </Page.P>
            </div>

            <Page.Separator />

            <div>
              <Page.SectionHeader title="Documentation" />
              <Page.P>
                For a detailed documentation of the Data source API, please
                refer to the{" "}
                <Link
                  href={"https://docs.dust.tt/reference/"}
                  className="py-1 font-bold text-action-600"
                >
                  API Reference
                </Link>
              </Page.P>
            </div>
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
