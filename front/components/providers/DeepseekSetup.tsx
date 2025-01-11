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

export default function DeepseekSetup({
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
    const check = await checkProvider(owner, "deepseek", {
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
    const res = await fetch(`/api/w/${owner.sId}/providers/deepseek`, {
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
    const res = await fetch(`/api/w/${owner.sId}/providers/deepseek`, {
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
          <NewDialogTitle>Setup Deepseek</NewDialogTitle>
          <NewDialogDescription>
            To use Deepseek models you must provide your API key. We'll never
            use your API key for anything other than to run your apps.
          </NewDialogDescription>
        </NewDialogHeader>

        <NewDialogContainer>
          <div className="flex flex-col">
            <input
              type="text"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-action-500 focus:ring-action-500 sm:text-sm"
              placeholder="Deepseek API Key"
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
                  Test succeeded! You can enable Deepseek.
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
