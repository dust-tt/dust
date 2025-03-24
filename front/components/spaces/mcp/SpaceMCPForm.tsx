import {
  Button,
  EyeIcon,
  EyeSlashIcon,
  Input,
  Label,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";

import type { MCPFormAction, MCPFormState } from "@app/types/mcp";

interface SpaceMCPFormProps {
  state: MCPFormState;
  dispatch: React.Dispatch<MCPFormAction>;
  isConfigurationLoading: boolean;
  onSynchronize: () => Promise<void>;
  isSynchronized: boolean;
  sharedSecret?: string;
  isSynchronizing?: boolean;
}

export function SpaceMCPForm({
  state,
  dispatch,
  isConfigurationLoading,
  onSynchronize,
  isSynchronized,
  sharedSecret,
  isSynchronizing = false,
}: SpaceMCPFormProps) {
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSecretVisible, setIsSecretVisible] = useState(false);

  useEffect(() => {
    setSyncError(null);
  }, [state.url]);

  const handleSynchronize = async () => {
    if (!state.url) {
      setSyncError("Please enter a valid URL before synchronizing.");
      return;
    }

    setSyncError(null);

    try {
      await onSynchronize();
    } catch (error) {
      console.error("Error synchronizing with MCP:", error);
      setSyncError(
        error instanceof Error
          ? error.message
          : "Failed to synchronize with MCP server"
      );
    }
  };

  const toggleSecretVisibility = () => {
    setIsSecretVisible(!isSecretVisible);
  };

  if (isConfigurationLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {syncError && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Synchronization Error
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{syncError}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="url">URL</Label>
        <div className="flex space-x-2">
          <div className="flex-grow">
            <Input
              id="url"
              placeholder="https://example.com/api/mcp"
              value={state.url}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                dispatch({
                  type: "SET_FIELD",
                  field: "url",
                  value: e.target.value,
                })
              }
              isError={!!state.errors?.url}
              message={state.errors?.url}
            />
          </div>
          <Button
            label={isSynchronizing ? "Synchronizing..." : "Synchronize"}
            variant="tertiary"
            onClick={handleSynchronize}
            disabled={isSynchronizing || !state.url}
          />
        </div>
      </div>

      {isSynchronized && (
        <>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="MCP Server Name"
              value={state.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                dispatch({
                  type: "SET_FIELD",
                  field: "name",
                  value: e.target.value,
                })
              }
              isError={!!state.errors?.name}
              message={state.errors?.name}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <TextArea
              id="description"
              placeholder="Description of the MCP Server"
              value={state.description}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                dispatch({
                  type: "SET_FIELD",
                  field: "description",
                  value: e.target.value,
                })
              }
            />
            {state.errors?.description && (
              <p className="mt-1 text-sm text-red-600">
                {state.errors.description}
              </p>
            )}
          </div>

          {sharedSecret && (
            <div className="space-y-2">
              <Label htmlFor="sharedSecret">Shared Secret</Label>
              <div className="relative">
                <Input
                  id="sharedSecret"
                  value={sharedSecret}
                  readOnly
                  type={isSecretVisible ? "text" : "password"}
                />
                <button
                  type="button"
                  onClick={toggleSecretVisibility}
                  className="absolute inset-y-0 right-0 flex items-center pr-3"
                >
                  {isSecretVisible ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                This is the secret key used to authenticate your MCP server with
                Dust. Keep it secure.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Available Tools</Label>
            <div className="space-y-4 rounded-md border p-4">
              {state.tools && state.tools.length > 0 ? (
                state.tools.map(
                  (
                    tool: { name: string; description: string },
                    index: number
                  ) => (
                    <div
                      key={index}
                      className="border-b pb-4 last:border-b-0 last:pb-0"
                    >
                      <h4 className="text-sm font-medium">{tool.name}</h4>
                      {tool.description && (
                        <p className="mt-1 text-xs text-gray-500">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  )
                )
              ) : (
                <p className="text-sm text-gray-500">No tools available</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
