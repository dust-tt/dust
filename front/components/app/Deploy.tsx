import "@uiw/react-textarea-code-editor/dist.css";

import { Dialog, Transition } from "@headlessui/react";
import { CubeIcon, DocumentDuplicateIcon } from "@heroicons/react/20/solid";
import { ArrowRightCircleIcon } from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Fragment, useState } from "react";

import { ActionButton, Button, HighlightButton } from "@app/components/Button";
import { useKeys } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { AppType, SpecificationType } from "@app/types/app";
import { RunConfig, RunType } from "@app/types/run";
import { WorkspaceType } from "@app/types/user";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

const cleanUpConfig = (config: RunConfig) => {
  if (!config) {
    return "{}";
  }
  let c = {} as { [key: string]: any };
  for (var key in config.blocks) {
    if (config.blocks[key].type !== "input") {
      c[key] = config.blocks[key];
      delete c[key].type;
    }
  }
  return JSON.stringify(c);
};

export default function Deploy({
  owner,
  app,
  spec,
  run,
  disabled,
  url,
}: {
  owner: WorkspaceType;
  app: AppType;
  spec: SpecificationType;
  run: RunType;
  disabled: boolean;
  url: string;
}) {
  const [open, setOpen] = useState(false);

  let { keys } = useKeys(owner);
  let activeKey = keys.find((k) => k.status === "active");
  const [copyButtonText, setCopyButtonText] = useState("Copy");

  // Prepare the cURL request
  const cURLRequest = (keyIsRevealed: boolean) => {
    let cURLKey = "YOUR_API_KEY";
    // Use the active API key if it exists (revealed for copy, unrevealed for display)
    if (activeKey) {
      cURLKey = keyIsRevealed
        ? activeKey.secret
        : `sk-...${activeKey.secret.slice(-5)}`;
    }
    let cURL = `curl ${url}/api/v1/w/${owner.sId}/apps/${app.sId}/runs \\
    -H "Authorization: Bearer ${cURLKey}" \\
    -H "Content-Type: application/json" \\
    -d '{
      "specification_hash": "${run?.app_hash}",
      "config": ${cleanUpConfig(run?.config)},
      "blocking": true,
      "inputs": [{ "hello": "world" }]
    }'`;
    return cURL;
  };

  // Copy the cURL request to the clipboard
  const handleCopyClick = () => {
    navigator.clipboard.writeText(cURLRequest(true));
    setCopyButtonText("Copied!");
  };

  return (
    <div>
      <HighlightButton
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <CubeIcon className="-ml-1 mr-1 h-5 w-5" />
        Deploy
      </HighlightButton>

      <Transition.Root show={open} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-10"
          onClose={() => setOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-800 bg-opacity-75 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                leave="ease-in duration-200"
                leaveTo="opacity-0"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl sm:p-6 lg:max-w-4xl">
                  <div data-color-mode="light">
                    <div className="mt-3">
                      <Dialog.Title
                        as="h3"
                        className="text-lg font-medium leading-6 text-gray-900"
                      >
                        Run as API Endpoint
                      </Dialog.Title>
                      <CodeEditor
                        readOnly={true}
                        value={`$ ${cURLRequest(false)}`}
                        language="shell"
                        padding={15}
                        className="mt-5 rounded-md bg-gray-700 px-4 py-4 font-mono text-[13px] text-white"
                        style={{
                          fontSize: 13,
                          fontFamily:
                            "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                          backgroundColor: "rgb(241 245 249)",
                        }}
                      />
                      <div className="mt-5 flex flex-initial">
                        <div className="">
                          {activeKey ? (
                            <p className="text-sm text-gray-500">
                              This command is ready to copy with your first
                              active API key.{" "}
                              <Link
                                href={`/w/${owner.sId}/keys`}
                                className={classNames(
                                  "inline-flex items-center rounded-md py-1 text-sm font-bold",
                                  "text-violet-600"
                                )}
                              >
                                Manage your API keys
                              </Link>{" "}
                              to use a different one.
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500">
                              <Link
                                href={`/w/${owner.sId}/keys`}
                                className={classNames(
                                  "inline-flex items-center rounded-md py-1 text-sm font-bold",
                                  "text-violet-600"
                                )}
                              >
                                Create an API key
                              </Link>{" "}
                              to run this command.
                            </p>
                          )}
                          <p className="-mt-1 text-sm text-gray-500">
                            Do not share your API keys: when run via this
                            endpoint, your app will use the providers set up on
                            your account.
                          </p>
                        </div>
                        <div className="flex-1"></div>
                        <div className="mt-1">
                          <ActionButton onClick={handleCopyClick}>
                            <DocumentDuplicateIcon className="-ml-1 mr-1 mt-0.5 h-5 w-5" />
                            {copyButtonText}
                          </ActionButton>
                        </div>
                      </div>
                      <p className="mt-4 text-sm text-gray-500">
                        For a detailed documentation of the Run model and Run
                        creation parameters, refer to the API reference.
                      </p>
                      <p className="mt-2">
                        <Link
                          href="https://docs.dust.tt/runs"
                          target="_blank"
                          className="mr-2"
                        >
                          <Button>
                            <ArrowRightCircleIcon className="-ml-1 mr-2 h-4 w-4" />
                            Visit API Reference
                          </Button>
                        </Link>
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-row items-center space-x-2 sm:mt-6">
                    <div className="flex-1"></div>
                    <div className="flex flex-initial">
                      <Button onClick={() => setOpen(false)}>Close</Button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </div>
  );
}
