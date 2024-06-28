import { Button } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { Fragment, useEffect, useState } from "react";
import { useSWRConfig } from "swr";

import { checkProvider } from "@app/lib/providers";
import { classNames } from "@app/lib/utils";

export default function AnthropicSetup({
  owner,
  open,
  setOpen,
  config,
  enabled,
}: {
  owner: WorkspaceType;
  open: boolean;
  setOpen: (open: boolean) => void;
  config: { [key: string]: string };
  enabled: boolean;
}) {
  const { mutate } = useSWRConfig();

  const [apiKey, setApiKey] = useState(config ? config.api_key : "");
  const [testSuccessful, setTestSuccessful] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testError, setTestError] = useState("");
  const [enableRunning, setEnableRunning] = useState(false);

  useEffect(() => {
    if (config && config.api_key.length > 0 && apiKey.length == 0) {
      setApiKey(config.api_key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const runTest = async () => {
    setTestRunning(true);
    setTestError("");
    const check = await checkProvider(owner, "anthropic", {
      api_key: apiKey,
    });

    if (!check.ok) {
      setTestError(check.error || "Unknown error");
      setTestSuccessful(false);
      setTestRunning(false);
    } else {
      setTestError("");
      setTestSuccessful(true);
      setTestRunning(false);
    }
  };

  const handleEnable = async () => {
    setEnableRunning(true);
    const res = await fetch(`/api/w/${owner.sId}/providers/anthropic`, {
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        config: JSON.stringify({
          api_key: apiKey,
        }),
      }),
    });
    await res.json();
    setEnableRunning(false);
    setOpen(false);
    await mutate(`/api/w/${owner.sId}/providers`);
  };

  const handleDisable = async () => {
    const res = await fetch(`/api/w/${owner.sId}/providers/anthropic`, {
      method: "DELETE",
    });
    await res.json();
    setOpen(false);
    await mutate(`/api/w/${owner.sId}/providers`);
  };

  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-30" onClose={() => setOpen(false)}>
        <TransitionChild as={Fragment} appear={true}>
          <div
            className={classNames(
              "fixed inset-0 bg-gray-800 bg-opacity-75 transition-opacity",
              "duration-700 ease-out",
              "data-[enter]:data-[closed]:opacity-0",
              "data-[leave]:data-[closed]:opacity-0"
            )}
          />
        </TransitionChild>

        <div className="fixed inset-0 z-30 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <DialogPanel
              className={classNames(
                "relative overflow-hidden rounded-lg bg-white p-4 sm:my-8 sm:w-full sm:max-w-sm sm:p-6 lg:max-w-lg",
                "duration-300",
                "data-[enter]:data-[closed]:opacity-0",
                "data-[leave]:data-[closed]:opacity-0"
              )}
              transition
            >
              <div className="mt-3">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  Setup Anthropic
                </DialogTitle>
                <div className="mt-4">
                  <p className="text-sm text-gray-500">
                    To use Anthropic models you must provide your API key. It
                    can be found{" "}
                    <a
                      className="font-bold text-action-600 hover:text-action-500"
                      href="https://console.anthropic.com/account/keys"
                      target="_blank"
                    >
                      here
                    </a>
                    &nbsp;(you can create a new key specifically for Dust).
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    We'll never use your API key for anything other than to run
                    your apps.
                  </p>
                </div>
                <div className="mt-6">
                  <input
                    type="text"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-action-500 focus:ring-action-500 sm:text-sm"
                    placeholder="Anthropic API Key"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setTestSuccessful(false);
                    }}
                  />
                </div>
              </div>
              <div className="mt-2 px-2 text-sm">
                {testError.length > 0 ? (
                  <span className="text-red-500">Error: {testError}</span>
                ) : testSuccessful ? (
                  <span className="text-green-600">
                    Test succeeded! You can enable Anthropic.
                  </span>
                ) : (
                  <span>&nbsp;</span>
                )}
              </div>
              <div className="mt-5 flex flex-row items-center justify-between space-x-2 sm:mt-6">
                {enabled ? (
                  <div
                    className="cursor-pointer text-sm font-bold text-red-500"
                    onClick={() => handleDisable()}
                  >
                    Disable
                  </div>
                ) : (
                  <div></div>
                )}
                <div className="flex space-x-2">
                  <Button
                    onClick={() => setOpen(false)}
                    label="Cancel"
                    variant="secondary"
                  />
                  {testSuccessful ? (
                    <Button
                      onClick={() => handleEnable()}
                      disabled={enableRunning}
                      label={
                        enabled
                          ? enableRunning
                            ? "Updating..."
                            : "Update"
                          : enableRunning
                            ? "Enabling..."
                            : "Enable"
                      }
                    />
                  ) : (
                    <Button
                      disabled={apiKey.length == 0 || testRunning}
                      onClick={() => runTest()}
                      label={testRunning ? "Testing..." : "Test"}
                    />
                  )}
                </div>
              </div>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
