import { clientFetch } from "@app/lib/egress/client";
import { checkProvider } from "@app/lib/providers";
import type { WorkspaceType } from "@app/types/user";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type React from "react";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";

type ProviderField = {
  name: string;
  label?: string;
  placeholder: MessageDescriptor;
  type?: string;
};

type ProviderConfig = {
  title: string;
  fields: {
    name: string;
    placeholder: MessageDescriptor;
    type?: string;
  }[];
  instructions: React.ReactNode;
};

const apiKeyPlaceholder = (provider: string) => msg`${provider} API key`;

function OpenAIInstructions() {
  return (
    <>
      <p>
        <Trans>
          To use OpenAI models you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://platform.openai.com/account/api-keys"
            target="_blank"
          >
            here
          </a>
          .
        </Trans>
      </p>
      <p className="mt-2">
        <Trans>
          We'll never use your API key for anything other than to run your apps.
        </Trans>
      </p>
    </>
  );
}

function AzureOpenAIInstructions() {
  return (
    <>
      <p>
        <Trans>
          To use Azure OpenAI models you must provide your API key and endpoint.
          They can be found in the left menu of your OpenAI Azure Resource
          portal (menu item `Keys and Endpoint`).
        </Trans>
      </p>
      <p className="mt-2">
        <Trans>
          We'll never use your API key for anything other than to run your apps.
        </Trans>
      </p>
    </>
  );
}

function AnthropicInstructions() {
  return (
    <>
      <p>
        <Trans>
          To use Anthropic models you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://console.anthropic.com/account/keys"
            target="_blank"
          >
            here
          </a>{" "}
          (you can create a new key specifically for Dust).
        </Trans>
      </p>
      <p className="mt-2">
        <Trans>
          We'll never use your API key for anything other than to run your apps.
        </Trans>
      </p>
    </>
  );
}

function MistralInstructions() {
  return (
    <>
      <p>
        <Trans>
          To use Mistral AI models you must provide your API key. It can be
          found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://console.mistral.ai/api-keys/"
            target="_blank"
          >
            here
          </a>{" "}
          (you can create a new key specifically for Dust).
        </Trans>
      </p>
      <p className="mt-2">
        <Trans>
          We'll never use your API key for anything other than to run your apps.
        </Trans>
      </p>
    </>
  );
}

function GoogleAIStudioInstructions() {
  return (
    <>
      <p>
        <Trans>
          To use Google AI Studio models you must provide your API key. It can
          be found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
          >
            here
          </a>{" "}
          (you can create a new key specifically for Dust).
        </Trans>
      </p>
      <p className="mt-2">
        <Trans>
          We'll never use your API key for anything other than to run your apps.
        </Trans>
      </p>
    </>
  );
}

function DeepseekInstructions() {
  return (
    <>
      <p>
        <Trans>To use Deepseek models you must provide your API key.</Trans>
      </p>
      <p className="mt-2">
        <Trans>
          We'll never use your API key for anything other than to run your apps.
        </Trans>
      </p>
    </>
  );
}

function FireworksInstructions() {
  return (
    <>
      <p>
        <Trans>To use Fireworks models you must provide your API key.</Trans>
      </p>
      <p className="mt-2">
        <Trans>
          We'll never use your API key for anything other than to run your apps.
        </Trans>
      </p>
    </>
  );
}

function XAIInstructions() {
  return (
    <>
      <p>
        <Trans>
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
        </Trans>
      </p>
      <p className="mt-2">
        <Trans>
          We'll never use your API key for anything other than to run your apps.
        </Trans>
      </p>
    </>
  );
}

function SerpAPIInstructions() {
  return (
    <>
      <p>
        <Trans>
          SerpAPI lets you search Google (and other search engines). To use
          SerpAPI you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://serpapi.com/manage-api-key"
            target="_blank"
          >
            here
          </a>
          .
        </Trans>
      </p>
      <p className="mt-2">
        <Trans>
          We'll never use your API key for anything other than to run your apps.
        </Trans>
      </p>
    </>
  );
}

function SerperInstructions() {
  return (
    <>
      <p>
        <Trans>
          Serper lets you search Google (and other search engines). To use
          Serper you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-highlight-600 hover:text-highlight-500"
            href="https://serper.dev/api-key"
            target="_blank"
          >
            here
          </a>
          .
        </Trans>
      </p>
      <p className="mt-2">
        <Trans>
          We'll never use your API key for anything other than to run your apps.
        </Trans>
      </p>
    </>
  );
}

function BrowserlessInstructions() {
  return (
    <>
      <p>
        <Trans>
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
        </Trans>
      </p>
      <p className="mt-2">
        <Trans>
          Note that it generally takes <span className="font-bold">5 mins</span>{" "}
          for the API key to become active (an email is sent when it's ready).
        </Trans>
      </p>
      <p className="mt-2">
        <Trans>
          We'll never use your API key for anything other than to run your apps.
        </Trans>
      </p>
    </>
  );
}

export const MODEL_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  openai: {
    title: "OpenAI",
    fields: [{ name: "api_key", placeholder: apiKeyPlaceholder("OpenAI") }],
    instructions: <OpenAIInstructions />,
  },
  azure_openai: {
    title: "Azure OpenAI",
    fields: [
      { name: "endpoint", placeholder: msg`Azure OpenAI endpoint` },
      { name: "api_key", placeholder: apiKeyPlaceholder("Azure OpenAI") },
    ],
    instructions: <AzureOpenAIInstructions />,
  },
  anthropic: {
    title: "Anthropic",
    fields: [{ name: "api_key", placeholder: apiKeyPlaceholder("Anthropic") }],
    instructions: <AnthropicInstructions />,
  },
  mistral: {
    title: "Mistral AI",
    fields: [{ name: "api_key", placeholder: apiKeyPlaceholder("Mistral AI") }],
    instructions: <MistralInstructions />,
  },
  google_ai_studio: {
    title: "Google AI Studio",
    fields: [
      { name: "api_key", placeholder: apiKeyPlaceholder("Google AI Studio") },
    ],
    instructions: <GoogleAIStudioInstructions />,
  },
  deepseek: {
    title: "Deepseek",
    fields: [{ name: "api_key", placeholder: apiKeyPlaceholder("Deepseek") }],
    instructions: <DeepseekInstructions />,
  },
  fireworks: {
    title: "Fireworks",
    fields: [{ name: "api_key", placeholder: apiKeyPlaceholder("Fireworks") }],
    instructions: <FireworksInstructions />,
  },
  xai: {
    title: "xAI",
    fields: [{ name: "api_key", placeholder: apiKeyPlaceholder("xAI") }],
    instructions: <XAIInstructions />,
  },
};

export const SERVICE_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  serpapi: {
    title: "SerpAPI Search",
    fields: [{ name: "api_key", placeholder: apiKeyPlaceholder("SerpAPI") }],
    instructions: <SerpAPIInstructions />,
  },
  serper: {
    title: "Serper Search",
    fields: [{ name: "api_key", placeholder: apiKeyPlaceholder("Serper") }],
    instructions: <SerperInstructions />,
  },
  browserlessapi: {
    title: "Browserless API",
    fields: [
      { name: "api_key", placeholder: apiKeyPlaceholder("Browserless") },
    ],
    instructions: <BrowserlessInstructions />,
  },
};

interface ProviderSetupProps {
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
  const { t } = useLingui();
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
      setTestError(check.error || t`Unknown error`);
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

    await clientFetch(`/api/w/${owner.sId}/providers/${providerId}`, {
      headers: { "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({ config: JSON.stringify(payload) }),
    });
    setEnableRunning(false);
    await mutate(`/api/w/${owner.sId}/providers`);
    onClose();
  };

  const handleDisable = async () => {
    await clientFetch(`/api/w/${owner.sId}/providers/${providerId}`, {
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
          type={field.type || "text"}
          placeholder={t(field.placeholder)}
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
            ? t`Updating...`
            : t`Update`
          : enableRunning
            ? t`Enabling...`
            : t`Enable`,
        variant: "primary" as const,
        disabled: enableRunning,
        onClick: handleEnable,
      }
    : {
        label: testRunning
          ? t`Testing...`
          : t({ message: "Test", context: "verb, button label" }),
        variant: "primary" as const,
        disabled: testDisabled,
        onClick: async (event: MouseEvent) => {
          event.preventDefault();
          await runTest();
        },
      };

  const errorDetails = JSON.stringify(testError);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {instructions || (
              <p>
                <Trans>Provide the necessary configuration for {title}.</Trans>
              </p>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogContainer>
          <div className="flex flex-col gap-4">
            {renderFields()}
            <div className="text-sm">
              {testError ? (
                <span className="text-warning">
                  <Trans>Error: {errorDetails}</Trans>
                </span>
              ) : testSuccessful ? (
                <span className="text-green-600">
                  {testSuccessMessage ||
                    t`Test succeeded! You can now enable ${title}.`}
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
                  label: t`Disable`,
                  variant: "warning",
                  onClick: handleDisable,
                }
              : {
                  label: t`Cancel`,
                  variant: "outline",
                }
          }
          rightButtonProps={rightButtonProps}
        />
      </DialogContent>
    </Dialog>
  );
}
