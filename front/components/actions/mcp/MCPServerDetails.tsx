import {
  Button,
  InformationCircleIcon,
  LockIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrashIcon,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useContext, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import type { InfoFormValues } from "@app/components/actions/mcp/forms/infoFormSchema";
import {
  diffInfoForm,
  getInfoFormDefaults,
  getInfoFormSchema,
} from "@app/components/actions/mcp/forms/infoFormSchema";
import { MCPServerDetailsInfo } from "@app/components/actions/mcp/MCPServerDetailsInfo";
import { MCPServerDetailsSharing } from "@app/components/actions/mcp/MCPServerDetailsSharing";
import { ConfirmContext } from "@app/components/Confirm";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import {
  getMcpServerDisplayName,
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  useDeleteMCPServer,
  useUpdateMCPServer,
  useUpdateMCPServerView,
} from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";

const DETAILS_TABS = ["info", "sharing"];
type TabType = (typeof DETAILS_TABS)[number];

interface MCPServerDetailsProps {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServerView: MCPServerViewType | null;
  isOpen: boolean;
}

export function MCPServerDetails({
  owner,
  mcpServerView,
  isOpen,
  onClose,
}: MCPServerDetailsProps) {
  const [selectedTab, setSelectedTab] = useState<TabType>("info");

  const confirm = useContext(ConfirmContext);
  const { deleteServer, isDeleting } = useDeleteMCPServer(owner);

  useEffect(() => {
    if (mcpServerView) {
      setSelectedTab(DETAILS_TABS[0]);
    }
  }, [mcpServerView]);

  const formDefaultValues = useMemo(() => {
    if (!mcpServerView) {
      return null;
    }
    return getInfoFormDefaults(mcpServerView);
  }, [mcpServerView]);

  const schema = useMemo(() => {
    if (!mcpServerView) {
      return null;
    }
    return getInfoFormSchema(mcpServerView);
  }, [mcpServerView]);

  const formMethods = useForm<InfoFormValues>({
    resolver: schema ? zodResolver(schema) : undefined,
    defaultValues: formDefaultValues ?? undefined,
    mode: "onChange",
    shouldUnregister: true,
  });

  const { updateServerView } = mcpServerView
    ? useUpdateMCPServerView(owner, mcpServerView)
    : { updateServerView: async () => false };
  const { updateServer } = mcpServerView
    ? useUpdateMCPServer(owner, mcpServerView)
    : { updateServer: async () => false };

  const handleCancel = () => {
    if (formDefaultValues) {
      formMethods.reset(formDefaultValues);
    }
  };

  const handleSave = formMethods.handleSubmit(async (values) => {
    if (!mcpServerView || !formDefaultValues) {
      return;
    }
    const isRemote = isRemoteMCPServerType(mcpServerView.server);
    const diff = diffInfoForm(formDefaultValues, values, isRemote);

    const updates: Array<() => Promise<boolean>> = [];
    if (diff.serverView) {
      const { name, description } = diff.serverView;
      updates.push(() => updateServerView({ name, description }));
    }
    if (diff.remoteIcon) {
      updates.push(() => updateServer({ icon: diff.remoteIcon! }));
    }
    if (diff.remoteSharedSecret) {
      updates.push(() =>
        updateServer({ sharedSecret: diff.remoteSharedSecret! })
      );
    }

    for (const u of updates) {
      const ok = await u();
      if (!ok) {
        return;
      }
    }

    formMethods.reset(values);
  });

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent size="lg">
        <SheetHeader className="flex flex-col gap-5 text-foreground dark:text-foreground-night">
          {mcpServerView && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {getAvatar(mcpServerView.server, "md")}
              </div>
              <div>
                <SheetTitle>
                  {getMcpServerViewDisplayName(mcpServerView)}
                </SheetTitle>
                <SheetDescription>
                  {getMcpServerViewDescription(mcpServerView)}
                </SheetDescription>
              </div>
            </div>
          )}
        </SheetHeader>
        <SheetContainer>
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList>
              <TabsTrigger
                value="info"
                label="Info"
                icon={InformationCircleIcon}
                onClick={() => setSelectedTab("info")}
              />
              {mcpServerView?.server.availability === "manual" && (
                <TabsTrigger
                  value="sharing"
                  label="Sharing"
                  icon={LockIcon}
                  onClick={() => setSelectedTab("sharing")}
                />
              )}

              {mcpServerView?.server.availability === "manual" && (
                <>
                  <div className="grow" />
                  <div className="flex h-full flex-row items-center">
                    <Button
                      icon={TrashIcon}
                      variant="warning"
                      label={isDeleting ? "Removing..." : "Remove"}
                      size="xs"
                      disabled={isDeleting}
                      onClick={async () => {
                        if (!mcpServerView) {
                          return;
                        }
                        const server = mcpServerView.server;
                        const confirmed = await confirm({
                          title: "Confirm Removal",
                          message: (
                            <div>
                              Are you sure you want to remove {""}
                              <span className="font-semibold">
                                {getMcpServerDisplayName(server)}
                              </span>
                              ?
                              <div className="mt-2 font-semibold">
                                This action cannot be undone.
                              </div>
                            </div>
                          ),
                          validateLabel: "Remove",
                          validateVariant: "warning",
                        });
                        if (!confirmed) {
                          return;
                        }
                        const deleted = await deleteServer(server);
                        if (deleted) {
                          onClose();
                        }
                      }}
                    />
                  </div>
                </>
              )}
            </TabsList>

            <div className="mt-4">
              <TabsContent value="info">
                {mcpServerView && formDefaultValues && (
                  <FormProvider form={formMethods}>
                    <div
                      key={mcpServerView.server.sId}
                      className="flex flex-col gap-4"
                    >
                      <MCPServerDetailsInfo
                        mcpServerView={mcpServerView}
                        owner={owner}
                      />
                      {formMethods.formState.isDirty && (
                        <div className="mt-2 flex flex-row items-end justify-end gap-2">
                          <Button
                            variant="outline"
                            label={"Cancel"}
                            onClick={handleCancel}
                            disabled={formMethods.formState.isSubmitting}
                          />
                          <Button
                            variant="highlight"
                            label={
                              formMethods.formState.isSubmitting
                                ? "Saving..."
                                : "Save"
                            }
                            onClick={(
                              e: React.MouseEvent<HTMLButtonElement>
                            ) => {
                              e.preventDefault();
                              void handleSave();
                            }}
                            disabled={formMethods.formState.isSubmitting}
                          />
                        </div>
                      )}
                    </div>
                  </FormProvider>
                )}
              </TabsContent>
              <TabsContent value="sharing">
                <MCPServerDetailsSharing
                  mcpServer={mcpServerView?.server}
                  owner={owner}
                />
              </TabsContent>
            </div>
          </Tabs>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
