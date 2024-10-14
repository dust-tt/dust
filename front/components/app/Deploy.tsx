import "@uiw/react-textarea-code-editor/dist.css";

import {
  Button,
  ClipboardIcon,
  CubeIcon,
  Modal,
  Page,
  Tooltip,
} from "@dust-tt/sparkle";
import type { AppType, SpecificationType } from "@dust-tt/types";
import type { RunConfig, RunType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

const cleanUpConfig = (config: RunConfig) => {
  if (!config) {
    return "{}";
  }
  const c = {} as { [key: string]: any };
  for (const key in config.blocks) {
    if (config.blocks[key].type !== "input") {
      c[key] = config.blocks[key];
      delete c[key].type;
    }
  }
  return JSON.stringify(c);
};

const DEFAULT_INPUTS = [{ hello: "world" }];

interface ViewAppAPIModalProps {
  owner: WorkspaceType;
  app: AppType;
  run: RunType;
  inputs?: unknown[];
  isOpen: boolean;
  onClose: () => void;
}

export function ViewAppAPIModal({
  owner,
  app,
  run,
  inputs = DEFAULT_INPUTS,
  isOpen,
  onClose,
}: ViewAppAPIModalProps) {
  const cURLRequest = (type: "run") => {
    switch (type) {
      case "run":
        return `curl ${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/api/v1/w/${owner.sId}/vaults/${app.vault.sId}/apps/${app.sId}/runs \\
    -H "Authorization: Bearer YOUR_API_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{
      "specification_hash": "${run?.app_hash}",
      "config": ${cleanUpConfig(run?.config)},
      "blocking": true,
      "inputs": ${JSON.stringify(inputs)}
    }'`;
      default:
        assertNever(type);
    }
  };

  const [copyRunButtonText, setCopyRunButtonText] = useState("Copy");

  // Copy the cURL request to the clipboard
  const handleCopyClick = async (type: "run") => {
    await navigator.clipboard.writeText(cURLRequest(type));

    switch (type) {
      case "run":
        setCopyRunButtonText("Copied!");
        setTimeout(() => {
          setCopyRunButtonText("Copy");
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
      title={"Apps API"}
    >
      <Page variant="modal">
        <div className="w-full">
          <Page.Vertical sizing="grow">
            <Page.P>
              <ul className="text-gray-500">
                <li>
                  vaultId: <span className="font-bold">{app.vault.sId}</span>{" "}
                </li>
                <li>
                  appId: <span className="font-bold">{app.sId}</span>
                </li>
              </ul>
            </Page.P>

            <Page.Separator />

            <Page.SectionHeader title="Run app" />
            <Page.P>
              Use the following cURL command to run the app{" "}
              <span className="italic">{app.name}</span>:
            </Page.P>
            <CodeEditor
              data-color-mode="light"
              readOnly={true}
              value={`$ ${cURLRequest("run")}`}
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
                  onClick={() => handleCopyClick("run")}
                  label={copyRunButtonText}
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
                  "https://docs.dust.tt/reference/post_api-v1-w-wid-vaults-vid-apps-aid-runs"
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

export default function Deploy({
  owner,
  app,
  run,
  disabled,
}: {
  owner: WorkspaceType;
  app: AppType;
  spec: SpecificationType;
  run: RunType;
  disabled: boolean;
}) {
  const [showViewAppAPIModal, setShowViewAppAPIModal] = useState(false);

  return (
    <div>
      <ViewAppAPIModal
        owner={owner}
        app={app}
        run={run}
        isOpen={showViewAppAPIModal}
        onClose={() => setShowViewAppAPIModal(false)}
      />
      <Tooltip
        label={
          disabled
            ? "You need to run this app at least once successfully to view the endpoint"
            : "View how to run this app programmatically"
        }
        trigger={
          <Button
            label="API"
            variant="primary"
            onClick={() => {
              setShowViewAppAPIModal(true);
            }}
            disabled={disabled}
            icon={CubeIcon}
          />
        }
      />
    </div>
  );
}
