import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import type { MouseEvent } from "react";
import React, { useEffect, useState } from "react";
import { useSWRConfig } from "swr";

import { checkProvider } from "@app/lib/providers";
import type { WorkspaceType } from "@app/types";

export type ProviderField = {
  name: string;
  label?: string;
  placeholder: string;
  type?: string;
};

type ProviderConfig = {
  title: string;
  fields: {
    name: string;
    placeholder: string;
    type?: string;
  }[];
  instructions: React.ReactNode;
};

export const MODEL_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  openai: {
    title: "OpenAI",
    fields: [{ name: "api_key", placeholder: "OpenAI API Key" }],
    instructions: (
      <>
        <p>
          To use OpenAI models you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://platform.openai.com/account/api-keys"
            target="_blank"
          >
            here
          </a>
          .
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  azure_openai: {
    title: "Azure OpenAI",
    fields: [
      { name: "endpoint", placeholder: "Azure OpenAI Endpoint" },
      { name: "api_key", placeholder: "Azure OpenAI API Key" },
    ],
    instructions: (
      <>
        <p>
          To use Azure OpenAI models you must provide your API key and Endpoint.
          They can be found in the left menu of your OpenAI Azure Resource
          portal (menu item `Keys and Endpoint`).
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  anthropic: {
    title: "Anthropic",
    fields: [{ name: "api_key", placeholder: "Anthropic API Key" }],
    instructions: (
      <>
        <p>
          To use Anthropic models you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://console.anthropic.com/account/keys"
            target="_blank"
          >
            here
          </a>
          &nbsp;(you can create a new key specifically for Dust).
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  mistral: {
    title: "Mistral AI",
    fields: [{ name: "api_key", placeholder: "Mistral AI API Key" }],
    instructions: (
      <>
        <p>
          To use Mistral AI models you must provide your API key. It can be
          found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://console.mistral.ai/api-keys/"
            target="_blank"
          >
            here
          </a>
          &nbsp;(you can create a new key specifically for Dust).
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  google_ai_studio: {
    title: "Google AI Studio",
    fields: [{ name: "api_key", placeholder: "Google AI Studio API Key" }],
    instructions: (
      <>
        <p>
          To use Google AI Studio models you must provide your API key. It can
          be found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
          >
            here
          </a>
          &nbsp;(you can create a new key specifically for Dust).
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  togetherai: {
    title: "TogetherAI",
    fields: [{ name: "api_key", placeholder: "TogetherAI API Key" }],
    instructions: (
      <>
        <p>To use TogetherAI models you must provide your API key.</p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  deepseek: {
    title: "Deepseek",
    fields: [{ name: "api_key", placeholder: "Deepseek API Key" }],
    instructions: (
      <>
        <p>To use Deepseek models you must provide your API key.</p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  fireworks: {
    title: "Fireworks",
    fields: [{ name: "api_key", placeholder: "Fireworks API Key" }],
    instructions: (
      <>
        <p>To use Fireworks models you must provide your API key.</p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  xai: {
    title: "xAI",
    fields: [{ name: "api_key", placeholder: "xAI API Key" }],
    instructions: (
      <>
        <p>
          To use xAI's Grok models you must provide your API key. It can be
          found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://x.ai/developers"
            target="_blank"
          >
            here
          </a>
          .
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
};

export const SERVICE_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  serpapi: {
    title: "SerpAPI Search",
    fields: [{ name: "api_key", placeholder: "SerpAPI API Key" }],
    instructions: (
      <>
        <p>
          SerpAPI lets you search Google (and other search engines). To use
          SerpAPI you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://serpapi.com/manage-api-key"
            target="_blank"
          >
            here
          </a>
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  serper: {
    title: "Serper Search",
    fields: [{ name: "api_key", placeholder: "Serper API Key" }],
    instructions: (
      <>
        <p>
          Serper lets you search Google (and other search engines). To use
          Serper you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://serper.dev/api-key"
            target="_blank"
          >
            here
          </a>
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  browserlessapi: {
    title: "Browserless API",
    fields: [{ name: "api_key", placeholder: "Browserless API Key" }],
    instructions: (
      <>
        <p>
          Browserless lets you use headless browsers to scrape web content. To
          use Browserless, you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://cloud.browserless.io/account/"
            target="_blank"
          >
            here
          </a>
          .
        </p>
        <p className="mt-2">
          Note that it generally takes <span className="font-bold">5 mins</span>{" "}
          for the API key to become active (an email is sent when it's ready).
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
};

export interface ProviderSetupProps {
  owner: WorkspaceType;
  providerId: string;
  title: string;
  instructions?: React.ReactNode;
  fields: ProviderField[];
  config: { [key: string]: string };
  enabled: boolean;
  testSuccessMessage?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ProviderSetup({
  owner,
  providerId,
  title,
  instructions,
  fields,
  config,
  enabled,
  testSuccessMessage,
  isOpen,
  onClose,
}: ProviderSetupProps) {
  const { mutate } = useSWRConfig();
  const [values, setValues] = useState<Record<string, string>>({});
  const [testError, setTestError] = useState("");
  const [testSuccessful, setTestSuccessful] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [enableRunning, setEnableRunning] = useState(false);

  useEffect(() => {
    const newValues: Record<string, string> = {};
    for (const field of fields) {
      newValues[field.name] = config[field.name] || "";
    }
    setValues(newValues);
    setTestSuccessful(false);
    setTestError("");
  }, [config, fields]);

  const runTest = async () => {
    setTestRunning(true);
    setTestError("");
    setTestSuccessful(false);

    const partialConfig: Record<string, string> = {};
    for (const field of fields) {
      partialConfig[field.name] = values[field.name];
    }

    const check = await checkProvider(owner, providerId, partialConfig);
    if (!check.ok) {
      setTestError(check.error || "Unknown error");
      setTestSuccessful(false);
    } else {
      setTestError("");
      setTestSuccessful(true);
    }
    setTestRunning(false);
  };

  const handleEnable = async () => {
    setEnableRunning(true);
    const payload: Record<string, string> = {};
    for (const field of fields) {
      payload[field.name] = values[field.name];
    }

    await fetch(`/api/w/${owner.sId}/providers/${providerId}`, {
      headers: { "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({ config: JSON.stringify(payload) }),
    });
    setEnableRunning(false);
    await mutate(`/api/w/${owner.sId}/providers`);
    onClose();
  };

  const handleDisable = async () => {
    await fetch(`/api/w/${owner.sId}/providers/${providerId}`, {
      method: "DELETE",
    });
    await mutate(`/api/w/${owner.sId}/providers`);
    onClose();
  };

  const renderFields = () =>
    fields.map((field) => (
      <div key={field.name}>
        {field.label && (
          <label className="mb-1 block text-sm font-medium leading-6">
            {field.label}
          </label>
        )}
        <Input
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          type={field.type || "text"}
          placeholder={field.placeholder}
          value={values[field.name]}
          onChange={(e) => {
            setTestSuccessful(false);
            const val = e.target.value;
            setValues((prev) => ({ ...prev, [field.name]: val }));
          }}
        />
      </div>
    ));

  const testDisabled =
    fields.some((field) => !values[field.name]) || testRunning;

  const rightButtonProps = testSuccessful
    ? {
        label: enabled
          ? enableRunning
            ? "Updating..."
            : "Update"
          : enableRunning
            ? "Enabling..."
            : "Enable",
        variant: "primary" as const,
        disabled: enableRunning,
        onClick: handleEnable,
      }
    : {
        label: testRunning ? "Testing..." : "Test",
        variant: "primary" as const,
        disabled: testDisabled,
        onClick: async (event: MouseEvent) => {
          event.preventDefault();
          await runTest();
        },
      };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
            {instructions || (
              <p>Provide the necessary configuration for {title}.</p>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogContainer>
          <div className="flex flex-col gap-4">
            {renderFields()}
            <div className="text-sm">
              {testError ? (
                <span className="text-warning">
                  Error: {JSON.stringify(testError)}
                </span>
              ) : testSuccessful ? (
                <span className="text-green-600">
                  {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
                  {testSuccessMessage ||
                    `Test succeeded! You can now enable ${title}.`}
                </span>
              ) : (
                <span>&nbsp;</span>
              )}
            </div>
          </div>
        </DialogContainer>

        <DialogFooter
          leftButtonProps={
            enabled
              ? {
                  label: "Disable",
                  variant: "warning",
                  onClick: handleDisable,
                }
              : {
                  label: "Cancel",
                  variant: "outline",
                }
          }
          rightButtonProps={rightButtonProps}
        />
      </DialogContent>
    </Dialog>
  );
}
