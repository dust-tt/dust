import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { MCPServerDetailsAvailability } from "@app/components/actions/mcp/MCPServerDetailsAvailability";
import { MCPServerDetailsGeneral } from "@app/components/actions/mcp/MCPServerDetailsGeneral";
import {
  MCPServerDetailsTools,
  MCPServerDetailsToolsBulkBar,
  useToolsAndStakesController,
} from "@app/components/actions/mcp/MCPServerDetailsTools";
import { ConfirmContext } from "@app/components/Confirm";
import type { SensitivityLabelsController } from "@app/components/shared/labels/types";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useDeleteMCPServer } from "@app/lib/swr/mcp_servers";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
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
  Trash01,
} from "@dust-tt/sparkle";
import { useContext, useEffect, useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

const DETAILS_TABS = ["general", "tools", "availability"] as const;
type TabType = (typeof DETAILS_TABS)[number];

interface MCPServerDetailsSheetProps {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServerView: MCPServerViewType | null;
  isOpen: boolean;
  onSave: () => Promise<boolean>;
  onCancel: () => void;
  spaces: SpaceType[];
  readOnly?: boolean;
  sensitivityLabelsController?: SensitivityLabelsController;
  confirmSkillsRestrictionChange: (
    isRestrictedToSkills: boolean
  ) => Promise<boolean>;
}

export function MCPServerDetailsSheet({
  owner,
  mcpServerView,
  isOpen,
  onClose,
  onSave,
  onCancel,
  spaces,
  readOnly = false,
  sensitivityLabelsController,
  confirmSkillsRestrictionChange,
}: MCPServerDetailsSheetProps) {
  const [selectedTab, setSelectedTab] = useState<TabType>("general");
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [isSaving, setIsSaving] = useState(false);

  const confirm = useContext(ConfirmContext);
  const { deleteServer, isDeleting } = useDeleteMCPServer(owner);

  const form = useFormContext<MCPServerFormValues>();
  const toolsController = useToolsAndStakesController(mcpServerView);

  useEffect(() => {
    // Only reset to the first tab when the sheet transitions from closed to open.
    if (isOpen && !prevIsOpen) {
      setSelectedTab("general");
    }
    setPrevIsOpen(isOpen);
  }, [isOpen, prevIsOpen]);

  const header = useMemo(() => {
    if (!mcpServerView) {
      return null;
    }
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {getAvatar(mcpServerView.server, "md")}
        </div>
        <div>
          <SheetTitle>{getMcpServerViewDisplayName(mcpServerView)}</SheetTitle>
          <SheetDescription>
            {getMcpServerViewDescription(mcpServerView)}
          </SheetDescription>
        </div>
      </div>
    );
  }, [mcpServerView]);

  const handleOpenChange = async (open: boolean) => {
    if (open) {
      return;
    }

    if (readOnly) {
      onClose();
      return;
    }

    const hasUnsavedChanges = form.formState.isDirty;

    if (hasUnsavedChanges) {
      const confirmed = await confirm({
        title: "Unsaved changes will be lost",
        message:
          "All unsaved changes will be lost. Are you sure you want to close?",
        validateLabel: "Close without saving",
        validateVariant: "warning",
      });
      if (!confirmed) {
        return;
      }
    }

    onCancel();
    onClose();
  };

  const handleRemove = async () => {
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
            {getMcpServerViewDisplayName(mcpServerView)}
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
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => void handleOpenChange(open)}>
      <SheetContent size="lg">
        <SheetHeader className="flex flex-col gap-5 text-foreground">
          {header}
        </SheetHeader>
        <SheetContainer>
          {readOnly ? (
            mcpServerView && (
              <MCPServerDetailsGeneral
                mcpServerView={mcpServerView}
                owner={owner}
                readOnly
              />
            )
          ) : (
            <Tabs
              value={selectedTab}
              onValueChange={(v) => setSelectedTab(v as TabType)}
            >
              <TabsList>
                <TabsTrigger value="general" label="General" />
                <TabsTrigger value="tools" label="Tools & Stakes" />
                <TabsTrigger value="availability" label="Availability" />
                {mcpServerView?.server.availability === "manual" && (
                  <>
                    <div className="grow" />
                    <div className="flex h-full flex-row items-center">
                      <Button
                        icon={Trash01}
                        variant="warning"
                        label={isDeleting ? "Removing..." : "Remove"}
                        size="sm"
                        disabled={isDeleting}
                        onClick={() => void handleRemove()}
                      />
                    </div>
                  </>
                )}
              </TabsList>
              <div className="mt-4">
                <TabsContent value="general">
                  {mcpServerView && (
                    <div className="flex flex-col gap-4">
                      <MCPServerDetailsGeneral
                        mcpServerView={mcpServerView}
                        owner={owner}
                        sensitivityLabelsController={
                          sensitivityLabelsController
                        }
                      />
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="tools">
                  {mcpServerView && (
                    <MCPServerDetailsTools
                      mcpServerView={mcpServerView}
                      controller={toolsController}
                    />
                  )}
                </TabsContent>
                <TabsContent value="availability">
                  <MCPServerDetailsAvailability
                    mcpServerView={mcpServerView}
                    spaces={spaces}
                    confirmSkillsRestrictionChange={
                      confirmSkillsRestrictionChange
                    }
                  />
                </TabsContent>
              </div>
            </Tabs>
          )}
        </SheetContainer>
        {/* Outside the container: the body scrolls inside a ScrollArea, where
            nothing can stick to the bottom of the sheet. */}
        {!readOnly && selectedTab === "tools" && (
          <div className="px-5">
            <MCPServerDetailsToolsBulkBar controller={toolsController} />
          </div>
        )}
        {!readOnly && (
          <div className="mt-2">
            <div className="flex flex-row gap-2 border-t border-border px-3 py-3">
              <Button
                label="Cancel"
                variant="outline"
                disabled={isSaving || form.formState.isSubmitting}
                onClick={() => handleOpenChange(false)}
              />
              <div className="flex-grow" />
              <Button
                label={
                  isSaving || form.formState.isSubmitting ? "Saving..." : "Save"
                }
                variant="primary"
                disabled={
                  isSaving ||
                  form.formState.isSubmitting ||
                  !!form.formState.errors.name
                }
                onClick={async () => {
                  setIsSaving(true);
                  try {
                    await onSave();
                  } finally {
                    setIsSaving(false);
                  }
                }}
              />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
