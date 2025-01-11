import {
  Button,
  NewDialog,
  NewDialogContainer,
  NewDialogContent,
  NewDialogDescription,
  NewDialogFooter,
  NewDialogHeader,
  NewDialogTitle,
  NewDialogTrigger,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";

import { checkProvider } from "@app/lib/providers";

export default function BrowserlessAPISetup({
  owner,
  config,
  enabled,
}: {
  owner: WorkspaceType;
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
  }, [config]);

  const runTest = async () => {
    setTestRunning(true);
    setTestError("");
    const check = await checkProvider(owner, "browserlessapi", {
      api_key: apiKey,
    });

    if (!check.ok) {
      setTestError(check.error);
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
    const res = await fetch(`/api/w/${owner.sId}/providers/browserlessapi`, {
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
    await mutate(`/api/w/${owner.sId}/providers`);
  };

  const handleDisable = async () => {
    const res = await fetch(`/api/w/${owner.sId}/providers/browserlessapi`, {
      method: "DELETE",
    });
    await res.json();
    await mutate(`/api/w/${owner.sId}/providers`);
  };

  return (
    <NewDialog>
      <NewDialogTrigger asChild>
        <Button
          variant={enabled ? "ghost" : "outline"}
          label={enabled ? "Edit" : "Set up"}
        />
      </NewDialogTrigger>
      <NewDialogContent>
        <NewDialogHeader>
          <NewDialogTitle>Setup Browserless API</NewDialogTitle>
          <NewDialogDescription>
            <div className="mt-4">
              <p>
                Browserless lets you use headless browsers to scrape web
                content. To use Browserless, you must provide your API key. It
                can be found{" "}
                <a
                  className="font-bold text-action-600 hover:text-action-500"
                  href="https://cloud.browserless.io/account/"
                  target="_blank"
                >
                  here
                </a>
                .
              </p>
              <p className="mt-2">
                Note that it generally takes{" "}
                <span className="font-bold">5 mins</span> for the API key to
                become active (an email is sent when it's ready).
              </p>
              <p className="mt-2">
                We'll never use your API key for anything other than to run your
                apps.
              </p>
            </div>
          </NewDialogDescription>
        </NewDialogHeader>

        <NewDialogContainer>
          <div className="flex flex-col gap-4">
            <input
              type="text"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-action-500 focus:ring-action-500 sm:text-sm"
              placeholder="Browserless API Key"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestSuccessful(false);
              }}
            />
            <div className="text-sm">
              {testError ? (
                <span className="text-red-500">Error: {testError}</span>
              ) : testSuccessful ? (
                <span className="text-green-600">
                  Test succeeded! You can enable the Browserless API.
                </span>
              ) : (
                <span>&nbsp;</span>
              )}
            </div>
          </div>
        </NewDialogContainer>

        <NewDialogFooter
          leftButtonProps={
            enabled
              ? {
                  label: "Disable",
                  variant: "warning",
                  onClick: handleDisable,
                }
              : undefined
          }
          rightButtonProps={
            testSuccessful
              ? {
                  label: enabled
                    ? enableRunning
                      ? "Updating..."
                      : "Update"
                    : enableRunning
                      ? "Enabling..."
                      : "Enable",
                  variant: "primary",
                  disabled: enableRunning,
                  onClick: handleEnable,
                }
              : {
                  label: testRunning ? "Testing..." : "Test",
                  variant: "primary",
                  disabled: apiKey.length === 0 || testRunning,
                  onClick: runTest,
                }
          }
        />
      </NewDialogContent>
    </NewDialog>
  );
}
