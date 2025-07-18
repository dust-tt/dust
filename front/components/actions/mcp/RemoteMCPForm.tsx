import {
  ActionBookOpenIcon,
  ActionIcons,
  Button,
  CloudArrowLeftRightIcon,
  CollapsibleComponent,
  ContentMessage,
  ExclamationCircleIcon,
  IconPicker,
  Input,
  Label,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import { isDefaultRemoteMcpServerURL } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import {
  addNewHeader,
  getDisplayHeaderKey,
  isValidHeaderKey,
  removeHeader,
  updateHeaderKey,
  updateHeaderValue,
  validateCustomHeaders,
  validateCustomHeadersForSubmission,
} from "@app/lib/actions/mcp_remote_actions/remote_mcp_custom_headers";
import type { RemoteMCPServerType } from "@app/lib/api/mcp";
import {
  useSyncRemoteMCPServer,
  useUpdateMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";

interface RemoteMCPFormProps {
  owner: LightWorkspaceType;
  mcpServer: RemoteMCPServerType;
}

const MCPFormSchema = z.object({
  name: z.string().min(1, "Name is required."),
  description: z.string().min(1, "Description is required."),
  icon: z.string({ required_error: "Icon is required." }),
  sharedSecret: z.string().optional(),
  customHeaders: z.record(z.string()).optional(),
});

export type MCPFormType = z.infer<typeof MCPFormSchema>;

interface CustomHeadersState {
  headers: Record<string, string>;
  hasHeaders: boolean;
}

const createCustomHeadersState = (
  headers: Record<string, string> = {}
): CustomHeadersState => ({
  headers,
  hasHeaders: Object.keys(headers).length > 0,
});

const createHeaderManager = (field: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}) => ({
  addHeader: () => {
    const newHeaders = addNewHeader(field.value || {});
    field.onChange(newHeaders);
  },
  removeHeader: (keyToRemove: string) => {
    const newHeaders = removeHeader(field.value || {}, keyToRemove);
    field.onChange(newHeaders);
  },
  updateHeaderKey: (oldKey: string, newKey: string) => {
    const newHeaders = updateHeaderKey(field.value || {}, oldKey, newKey);
    field.onChange(newHeaders);
  },
  updateHeaderValue: (key: string, newValue: string) => {
    const newHeaders = updateHeaderValue(field.value || {}, key, newValue);
    field.onChange(newHeaders);
  },
});

export function RemoteMCPForm({ owner, mcpServer }: RemoteMCPFormProps) {
  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [customHeadersErrors, setCustomHeadersErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isDefaultServer = isDefaultRemoteMcpServerURL(mcpServer.url);

  const authenticationState = useMemo(() => {
    const hasCustomHeaders =
      mcpServer.customHeaders &&
      Object.keys(mcpServer.customHeaders).length > 0;
    const hasBearerToken = mcpServer.sharedSecret && !hasCustomHeaders;

    return {
      hasCustomHeaders,
      hasBearerToken,
      authMethod: hasCustomHeaders
        ? "custom-headers"
        : hasBearerToken
          ? "bearer"
          : "none",
    } as const;
  }, [mcpServer.customHeaders, mcpServer.sharedSecret]);

  const form = useForm<MCPFormType>({
    resolver: zodResolver(MCPFormSchema),
    defaultValues: {
      name: getMcpServerDisplayName(mcpServer),
      description: mcpServer.description,
      icon: mcpServer.icon,
      sharedSecret: mcpServer.sharedSecret || "",
      customHeaders: mcpServer.customHeaders || {},
    },
  });

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "customHeaders" || !name) {
        const rawHeaders = value.customHeaders || {};
        const customHeaders: Record<string, string> = {};
        Object.entries(rawHeaders).forEach(([key, val]) => {
          if (typeof val === "string") {
            customHeaders[key] = val;
          }
        });

        const errors = validateCustomHeaders(customHeaders);
        setCustomHeadersErrors(errors);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Use the serverId from state for the hooks
  const { updateServer } = useUpdateMCPServer(owner, mcpServer.sId);
  const { syncServer } = useSyncRemoteMCPServer(owner, mcpServer.sId);
  const { url, lastError, lastSyncAt } = mcpServer;

  const onSubmit = useCallback(
    async (values: MCPFormType) => {
      setError(null);

      const customHeadersState = createCustomHeadersState(values.customHeaders);
      if (authenticationState.hasCustomHeaders) {
        const submissionErrors = validateCustomHeadersForSubmission(
          values.customHeaders || {}
        );
        if (submissionErrors.length > 0) {
          setError(submissionErrors.join(". "));
          return;
        }
      }

      if (authenticationState.hasBearerToken && !values.sharedSecret?.trim()) {
        setError("Bearer token is required for this server's authentication.");
        return;
      }

      const updateData = {
        name: values.name,
        description: values.description,
        icon: values.icon,
        sharedSecret: customHeadersState.hasHeaders
          ? ""
          : values.sharedSecret || "",
        customHeaders: customHeadersState.hasHeaders
          ? values.customHeaders
          : {},
      };

      const updated = await updateServer(updateData);
      if (updated) {
        form.reset(values);
      }
    },
    [
      updateServer,
      form,
      customHeadersErrors,
      authenticationState.hasCustomHeaders,
      authenticationState.hasBearerToken,
    ]
  );

  const handleSynchronize = useCallback(async () => {
    setIsSynchronizing(true);
    await syncServer();
    setIsSynchronizing(false);
    setError(null);
  }, [syncServer]);

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  const isFormValid = useMemo(() => {
    return form.formState.isValid && customHeadersErrors.length === 0;
  }, [form.formState.isValid, customHeadersErrors]);

  const renderCustomHeadersController = useCallback(
    ({ field }: { field: any }) => {
      const customHeadersState = createCustomHeadersState(field.value);
      const headerManager = createHeaderManager(field);

      if (!customHeadersState.hasHeaders) {
        headerManager.addHeader();
        return <div></div>; // Will re-render with the new header
      }

      return (
        <div className="space-y-3">
          <div>
            <Label>Custom Headers</Label>
            {customHeadersErrors.length > 0 && (
              <div className="mt-2 space-y-1 text-sm text-red-600">
                {customHeadersErrors.map((error, index) => (
                  <div key={index}>• {error}</div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {Object.entries(customHeadersState.headers).map(
              ([key, value], index) => {
                const totalHeaders = Object.keys(
                  customHeadersState.headers
                ).length;
                const isOnlyHeader = totalHeaders === 1;

                return (
                  <div key={`header-${index}`} className="flex space-x-2">
                    <Input
                      placeholder="Header name"
                      value={getDisplayHeaderKey(key)}
                      onChange={(e) => {
                        const newKey = e.target.value;
                        headerManager.updateHeaderKey(key, newKey);
                      }}
                      isError={
                        !isValidHeaderKey(getDisplayHeaderKey(key)) &&
                        getDisplayHeaderKey(key).trim() !== ""
                      }
                      className="flex-1"
                    />
                    <Input
                      placeholder="Header value"
                      value={value}
                      onChange={(e) => {
                        headerManager.updateHeaderValue(key, e.target.value);
                      }}
                      isError={!value.trim() && key.trim() !== ""}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      label="Remove"
                      disabled={isOnlyHeader}
                      className={isOnlyHeader ? "opacity-50" : ""}
                      onClick={() => {
                        if (!isOnlyHeader) {
                          headerManager.removeHeader(key);
                        }
                      }}
                    />
                  </div>
                );
              }
            )}
            <Button
              variant="outline"
              size="sm"
              label="Add Header"
              onClick={headerManager.addHeader}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500-night">
            These custom headers will be sent with each request to your server.
          </p>
        </div>
      );
    },
    [form, customHeadersErrors]
  );

  return (
    <div className="space-y-5 text-foreground dark:text-foreground-night">
      {lastError && (
        <ContentMessage
          variant="warning"
          icon={ExclamationCircleIcon}
          size="sm"
          title="Synchronization Error"
        >
          Server could not synchronize successfully. Last attempt{" "}
          {lastSyncAt ? "on " + new Date(lastSyncAt).toLocaleString() : ""} :{" "}
          {lastError}
        </ContentMessage>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="space-y-2">
        <Label htmlFor="url">Server URL</Label>
        <div className="flex space-x-2">
          <div className="flex-grow">
            <Input
              value={url}
              disabled
              placeholder="https://example.com/api/mcp"
            />
          </div>
          <Button
            label={isSynchronizing ? "Syncing..." : "Sync"}
            isLoading={isSynchronizing}
            icon={CloudArrowLeftRightIcon}
            variant="outline"
            onClick={handleSynchronize}
            disabled={isSynchronizing}
          />
        </div>
      </div>

      <div className="flex items-end space-x-2">
        <div className="flex-grow">
          <Controller
            control={form.control}
            name="name"
            render={({ field }) => (
              <Input
                {...field}
                label="Name"
                disabled={isDefaultServer}
                isError={!!form.formState.errors.name}
                message={form.formState.errors.name?.message}
                placeholder={mcpServer.cachedName}
              />
            )}
          />
        </div>
        <Controller
          control={form.control}
          name="icon"
          render={({ field }) => {
            const currentIcon = field.value;
            const CurrentIconComponent =
              ActionIcons[currentIcon as keyof typeof ActionIcons] ||
              ActionBookOpenIcon;

            return (
              <PopoverRoot open={isPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={CurrentIconComponent}
                    onClick={() => setIsPopoverOpen(true)}
                    isSelect
                    disabled={isDefaultServer}
                  />
                </PopoverTrigger>
                <PopoverContent
                  className="w-fit py-0"
                  onInteractOutside={closePopover}
                  onEscapeKeyDown={closePopover}
                >
                  <IconPicker
                    icons={ActionIcons}
                    selectedIcon={currentIcon}
                    onIconSelect={(iconName: string) => {
                      field.onChange(iconName);
                      closePopover();
                    }}
                  />
                </PopoverContent>
              </PopoverRoot>
            );
          }}
        />
      </div>

      <div className="space-y-2">
        <Controller
          control={form.control}
          name="description"
          render={({ field }) => (
            <>
              <Input
                {...field}
                label="Description"
                disabled={isDefaultServer}
                isError={!!form.formState.errors.description?.message}
                message={form.formState.errors.description?.message}
                placeholder={
                  mcpServer.cachedDescription ?? DEFAULT_MCP_ACTION_DESCRIPTION
                }
              />
              <p className="text-xs text-gray-500 dark:text-gray-500-night">
                This is only for internal reference and is not shown to the
                model.
              </p>
            </>
          )}
        />
      </div>

      {!mcpServer.authorization && (
        <CollapsibleComponent
          triggerChildren={<div className="heading-lg">Advanced Settings</div>}
          contentChildren={
            <div className="space-y-4">
              {!authenticationState.hasCustomHeaders && (
                <Controller
                  control={form.control}
                  name="sharedSecret"
                  render={({ field }) => (
                    <>
                      <Input
                        {...field}
                        label="Bearer Token (Authorization)"
                        isError={!!form.formState.errors.sharedSecret}
                        message={form.formState.errors.sharedSecret?.message}
                        placeholder="Paste the Bearer Token here"
                        onChange={(e) => {
                          field.onChange(e);
                          if (e.target.value.trim()) {
                            form.setValue("customHeaders", {});
                          }
                        }}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-500-night">
                        This will be sent alongside the request made to your
                        server as a Bearer token in the headers.
                      </p>
                    </>
                  )}
                />
              )}

              {!authenticationState.hasBearerToken && (
                <Controller
                  control={form.control}
                  name="customHeaders"
                  render={({ field }) =>
                    renderCustomHeadersController({ field })
                  }
                />
              )}
            </div>
          }
        />
      )}

      {form.formState.isDirty && (
        <div className="flex flex-row items-end justify-end gap-2">
          <Button
            variant="outline"
            label={"Cancel"}
            disabled={form.formState.isSubmitting}
            onClick={() => {
              form.reset();
              setError(null);
            }}
          />

          <Button
            variant="highlight"
            label={form.formState.isSubmitting ? "Saving..." : "Save"}
            disabled={form.formState.isSubmitting || !isFormValid}
            onClick={async (event: Event) => {
              event.preventDefault();
              void form.handleSubmit(onSubmit)();
            }}
          />
        </div>
      )}
    </div>
  );
}
