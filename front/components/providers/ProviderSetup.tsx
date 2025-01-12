import {
  NewDialog,
  NewDialogContainer,
  NewDialogContent,
  NewDialogDescription,
  NewDialogFooter,
  NewDialogHeader,
  NewDialogTitle,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import React, { type MouseEvent, useEffect, useState } from "react";
import { useSWRConfig } from "swr";

import { checkProvider } from "@app/lib/providers";

export type ProviderField = {
  name: string;
  label?: string;
  placeholder: string;
  type?: string;
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
        <input
          type={field.type || "text"}
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-action-500 focus:ring-action-500 sm:text-sm"
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
    <NewDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <NewDialogContent>
        <NewDialogHeader>
          <NewDialogTitle>{title}</NewDialogTitle>
          <NewDialogDescription>
            {instructions || (
              <p>Provide the necessary configuration for {title}.</p>
            )}
          </NewDialogDescription>
        </NewDialogHeader>

        <NewDialogContainer>
          <div className="flex flex-col gap-4">
            {renderFields()}
            <div className="text-sm">
              {testError ? (
                <span className="text-red-500">Error: {testError}</span>
              ) : testSuccessful ? (
                <span className="text-green-600">
                  {testSuccessMessage ||
                    `Test succeeded! You can now enable ${title}.`}
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
              : {
                  label: "Cancel",
                  variant: "outline",
                }
          }
          rightButtonProps={rightButtonProps}
        />
      </NewDialogContent>
    </NewDialog>
  );
}
