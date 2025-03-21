import {
  Button,
  Input,
  Label,
  TextArea,
  Spinner,
  Page,
} from "@dust-tt/sparkle";
import { ChangeEvent, useEffect, useState } from "react";

import { MCPFormAction, MCPFormState, MCPTool } from "@app/types/mcp";

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
    // Reset any error state when the URL changes
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
      setSyncError(error instanceof Error ? error.message : "Failed to synchronize with MCP server");
    }
  };

  const toggleSecretVisibility = () => {
    setIsSecretVisible(!isSecretVisible);
  };

  if (isConfigurationLoading) {
    return (
      <div className="flex justify-center items-center p-8">
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
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Synchronization Error</h3>
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
                dispatch({ type: "SET_FIELD", field: "url", value: e.target.value })
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
              <p className="text-sm text-red-600 mt-1">{state.errors.description}</p>
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
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {isSecretVisible ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                This is the secret key used to authenticate your MCP server with Dust. Keep it secure.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Available Tools</Label>
            <div className="border rounded-md p-4 space-y-4">
              {state.tools && state.tools.length > 0 ? (
                state.tools.map((tool: string, index: number) => (
                  <div key={index} className="border-b pb-2 last:border-b-0 last:pb-0">
                    <h4 className="font-medium text-sm">{tool}</h4>
                  </div>
                ))
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
