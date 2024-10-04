import "@uiw/react-textarea-code-editor/dist.css";

import { Button, ClipboardIcon, Modal, Page } from "@dust-tt/sparkle";
import type { DataSourceType, VaultType, WorkspaceType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

interface ViewFolderAPIModalProps {
  owner: WorkspaceType;
  vault: VaultType;
  dataSource: DataSourceType;
  isOpen: boolean;
  onClose: () => void;
}

export function ViewFolderAPIModal({
  owner,
  vault,
  dataSource,
  isOpen,
  onClose,
}: ViewFolderAPIModalProps) {
  const cURLRequest = (type: "upsert" | "search") => {
    switch (type) {
      case "upsert":
        return `curl "${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/api/v1/w/${owner.sId}/vaults/${vault.sId}/data_sources/${dataSource.sId}/documents/YOUR_DOCUMENT_ID" \\
    -H "Authorization: Bearer YOUR_API_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{
      "text": "Lorem ipsum dolor sit amet...",
      "source_url": "https://acme.com"
    }'`;
      case "search":
        return `curl "${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/api/v1/w/${owner.sId}/vaults/${vault.sId}/data_sources/${dataSource.sId}/search?query=foo+bar&top_k=16&full_text=false" \\
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
      title={"Data source API"}
    >
      <Page variant="modal">
        <div className="w-full">
          <Page.Vertical sizing="grow">
            <Page.P>
              <ul className="text-gray-500">
                <li>
                  vaultId: <span className="font-bold">{vault.sId}</span>{" "}
                </li>
                <li>
                  dataSourceId:{" "}
                  <span className="font-bold">{dataSource.sId}</span>
                </li>
              </ul>
            </Page.P>

            <Page.Separator />

            <Page.SectionHeader title="Upsert document" />
            <Page.P>
              Use the following cURL command to upsert a document to folder{" "}
              <span className="italic">{dataSource.name}</span>:
            </Page.P>
            <CodeEditor
              data-color-mode="light"
              readOnly={true}
              value={`$ ${cURLRequest("upsert")}`}
              language="shell"
              padding={15}
              className="font-mono mt-5 rounded-md bg-gray-700 px-4 py-4 text-[13px] text-white"
              style={{
                fontSize: 13,
                fontFamily:
                  "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                backgroundColor: "rgb(241 245 249)",
                width: "100%",
                marginTop: "0rem",
              }}
            />

            <div className="flex w-full flex-row items-end">
              <div className="flex-grow"></div>
              <div className="flex">
                <Button
                  variant="secondary"
                  onClick={() => handleCopyClick("upsert")}
                  label={copyUpsertButtonText}
                  icon={ClipboardIcon}
                />
              </div>
            </div>
            <Page.Separator />

            <Page.SectionHeader title="Search" />
            <Page.P>
              Use the following cURL command to search in folder{" "}
              <span className="italic">{dataSource.name}</span>:
            </Page.P>
            <CodeEditor
              data-color-mode="light"
              readOnly={true}
              value={`$ ${cURLRequest("search")}`}
              language="shell"
              padding={15}
              className="font-mono mt-5 rounded-md bg-gray-700 px-4 py-4 text-[13px] text-white"
              style={{
                fontSize: 13,
                fontFamily:
                  "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                backgroundColor: "rgb(241 245 249)",
                width: "100%",
                marginTop: "0rem",
              }}
            />
            <div className="flex w-full flex-row items-end">
              <div className="flex-grow"></div>
              <div className="flex">
                <Button
                  variant="secondary"
                  onClick={() => handleCopyClick("search")}
                  label={copySearchButtonText}
                  icon={ClipboardIcon}
                />
              </div>
            </div>

            <Page.Separator />

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
                Handle API keys with care as they provide access to your company
                data.
              </span>
            </Page.P>

            <Page.Separator />

            <Page.SectionHeader title="Documentation" />
            <Page.P>
              For a detailed documentation of the Data source API, please refer
              to the{" "}
              <Link
                href={
                  "https://docs.dust.tt/reference/get_api-v1-w-wid-vaults-vid-data-sources-dsid-documents-documentid"
                }
                className="py-1 font-bold text-action-600"
              >
                API Reference
              </Link>
            </Page.P>
          </Page.Vertical>
        </div>
      </Page>
    </Modal>
  );
}
