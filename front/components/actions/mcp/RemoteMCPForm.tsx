import {
  Button,
  EyeIcon,
  EyeSlashIcon,
  Input,
  Label,
  TextArea,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";

import type { MCPFormAction, MCPFormState } from "@app/lib/actions/mcp";

interface RemoteMCPFormProps {
  state: MCPFormState;
  dispatch: React.Dispatch<MCPFormAction>;
  onSynchronize: () => Promise<void>;
  sharedSecret?: string;
  isSynchronizing?: boolean;
}

export function RemoteMCPForm({
  state,
  dispatch,
  onSynchronize,
  sharedSecret,
  isSynchronizing = false,
}: RemoteMCPFormProps) {
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

  return (
    <div className="space-y-6">
      {syncError && (
        <div className="rounded-md bg-warning-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <XMarkIcon className="h-5 w-5 text-warning-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-warning-800">
                Synchronization Error
              </h3>
              <div className="mt-2 text-sm text-warning-700">
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
              disabled
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
            variant="outline"
            onClick={handleSynchronize}
            disabled={isSynchronizing}
          />
        </div>
      </div>

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
            <div className="absolute inset-y-0 right-0 flex items-center pr-1">
              <Button
                icon={isSecretVisible ? EyeSlashIcon : EyeIcon}
                variant="tertiary"
                size="xs"
                onClick={toggleSecretVisibility}
                labelVisible={false}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            This is the secret key used to authenticate your MCP server with
            Dust. Keep it secure.
          </p>
        </div>
      )}
    </div>
  );
}
