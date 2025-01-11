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

export default function AzureOpenAISetup({
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
  const [endpoint, setEndpoint] = useState(config ? config.endpoint : "");
  const [testSuccessful, setTestSuccessful] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testError, setTestError] = useState("");
  const [enableRunning, setEnableRunning] = useState(false);

  useEffect(() => {
    if (config && config.api_key.length > 0 && apiKey.length == 0) {
      setApiKey(config.api_key);
    }
    if (config && config.endpoint.length > 0 && endpoint.length == 0) {
      setEndpoint(config.endpoint);
    }
  }, [config]);

  const runTest = async () => {
    setTestRunning(true);
    setTestError("");
    const check = await checkProvider(owner, "azure_openai", {
      api_key: apiKey,
      endpoint,
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
    const res = await fetch(`/api/w/${owner.sId}/providers/azure_openai`, {
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        config: JSON.stringify({
          api_key: apiKey,
          endpoint,
        }),
      }),
    });
    await res.json();
    setEnableRunning(false);
    await mutate(`/api/w/${owner.sId}/providers`);
  };

  const handleDisable = async () => {
    const res = await fetch(`/api/w/${owner.sId}/providers/azure_openai`, {
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
          <NewDialogTitle>Setup Azure OpenAI</NewDialogTitle>
          <NewDialogDescription>
            To use Azure OpenAI models you must provide your API key and
            Endpoint. They can be found in the left menu of your OpenAI Azure
            Resource portal (menu item `Keys and Endpoint`). We'll never use
            your API key for anything other than to run your apps.
          </NewDialogDescription>
        </NewDialogHeader>

        <NewDialogContainer>
          <div className="flex flex-col gap-4">
            <input
              type="text"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-violet-500 focus:ring-violet-500 sm:text-sm"
              placeholder="Azure OpenAI Endpoint"
              value={endpoint}
              onChange={(e) => {
                setEndpoint(e.target.value);
                setTestSuccessful(false);
              }}
            />
            <input
              type="text"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-violet-500 focus:ring-violet-500 sm:text-sm"
              placeholder="Azure OpenAI API Key"
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
                  Test succeeded! You can enable Azure OpenAI.
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
                  disabled:
                    apiKey.length === 0 || endpoint.length === 0 || testRunning,
                  onClick: runTest,
                }
          }
        />
      </NewDialogContent>
    </NewDialog>
  );
}
