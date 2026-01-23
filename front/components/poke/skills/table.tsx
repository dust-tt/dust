import {
  ActionIcons,
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconPicker,
  Input,
  Label,
  PlusIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  TextArea,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForSkills } from "@app/components/poke/skills/columns";
import { useSendNotification } from "@app/hooks/useNotification";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { PostSkillSuggestionBodyType } from "@app/pages/api/poke/workspaces/[wId]/skills/suggestions";
import { usePokeMCPServerViews } from "@app/poke/swr/mcp_server_views";
import { usePokeSkills } from "@app/poke/swr/skills";
import type { LightWorkspaceType } from "@app/types";

const AUTO_INTERNAL_MCP_SERVER_NAMES = new Set(
  Object.entries(INTERNAL_MCP_SERVERS)
    .filter(([, server]) => server.availability === "auto")
    .map(([name]) => name)
);

interface SkillsDataTableProps {
  owner: LightWorkspaceType;
  loadOnInit?: boolean;
}

export function SkillsDataTable({ owner, loadOnInit }: SkillsDataTableProps) {
  const [showCreateSuggestionSheet, setShowCreateSuggestionSheet] =
    useState(false);
  const { mutate } = usePokeSkills({ owner, disabled: true });

  const skillButtons = (
    <div className="flex flex-row gap-2">
      <Button
        aria-label="Create skill suggestion"
        variant="outline"
        size="sm"
        onClick={() => setShowCreateSuggestionSheet(true)}
        label="💡 Create skill suggestion"
      />
    </div>
  );

  return (
    <>
      <CreateSkillSuggestionSheet
        show={showCreateSuggestionSheet}
        onClose={() => setShowCreateSuggestionSheet(false)}
        owner={owner}
        onSuccess={() => mutate()}
      />
      <PokeDataTableConditionalFetch
        header="Skills"
        globalActions={skillButtons}
        owner={owner}
        loadOnInit={loadOnInit}
        useSWRHook={usePokeSkills}
      >
        {(data) => (
          <PokeDataTable columns={makeColumnsForSkills(owner)} data={data} />
        )}
      </PokeDataTableConditionalFetch>
    </>
  );
}

interface CreateSkillSuggestionSheetProps {
  show: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  onSuccess: () => void;
}

function CreateSkillSuggestionSheet({
  show,
  onClose,
  owner,
  onSuccess,
}: CreateSkillSuggestionSheetProps) {
  const sendNotification = useSendNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  const [name, setName] = useState("");
  const [userFacingDescription, setUserFacingDescription] = useState("");
  const [agentFacingDescription, setAgentFacingDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [selectedMcpServerViews, setSelectedMcpServerViews] = useState<
    MCPServerViewType[]
  >([]);
  const [mcpSearchText, setMcpSearchText] = useState("");

  const { data: mcpServerViews, isLoading: isMcpServerViewsLoading } =
    usePokeMCPServerViews({ owner, disabled: false });

  // Filter to auto internal MCP servers that don't require configuration
  const availableMcpServerViews = useMemo(() => {
    return mcpServerViews.filter(
      (view) =>
        AUTO_INTERNAL_MCP_SERVER_NAMES.has(view.server.name) &&
        getMCPServerRequirements(view).noRequirement
    );
  }, [mcpServerViews]);

  const filteredMcpServerViews = useMemo(() => {
    return availableMcpServerViews.filter((view) =>
      getMcpServerViewDisplayName(view)
        .toLowerCase()
        .includes(mcpSearchText.toLowerCase())
    );
  }, [availableMcpServerViews, mcpSearchText]);

  const resetForm = () => {
    setName("");
    setUserFacingDescription("");
    setAgentFacingDescription("");
    setInstructions("");
    setIcon(null);
    setSelectedMcpServerViews([]);
    setMcpSearchText("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (
      !name.trim() ||
      !userFacingDescription.trim() ||
      !agentFacingDescription.trim() ||
      !instructions.trim()
    ) {
      sendNotification({
        type: "error",
        title: "Validation error",
        description: "All fields are required.",
      });
      return;
    }

    setIsSubmitting(true);
    const response = await clientFetch(
      `/api/poke/workspaces/${owner.sId}/skills/suggestions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          userFacingDescription: userFacingDescription.trim(),
          agentFacingDescription: agentFacingDescription.trim(),
          instructions: instructions.trim(),
          icon: icon ?? null,
          mcpServerNames: selectedMcpServerViews.map(
            (view) => view.server.name as AutoInternalMCPServerNameType
          ),
        } satisfies PostSkillSuggestionBodyType),
      }
    );
    setIsSubmitting(false);

    if (!response.ok) {
      const errorData = await getErrorFromResponse(response);
      sendNotification({
        type: "error",
        title: "Failed to create skill suggestion",
        description: errorData.message,
      });
    } else {
      sendNotification({
        type: "success",
        title: "Skill suggestion created",
        description: `"${name.trim()}" has been created.`,
      });
      resetForm();
      onClose();
      onSuccess();
    }
  };

  const toActionIconKey = (v?: string | null) =>
    v && v in ActionIcons ? (v as keyof typeof ActionIcons) : undefined;

  const selectedIconName =
    toActionIconKey(icon) ??
    ("ActionListCheckIcon" as keyof typeof ActionIcons);
  const IconComponent =
    ActionIcons[selectedIconName] || ActionIcons["ActionListCheckIcon"];

  return (
    <Sheet
      open={show}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>Create a skill suggestion</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-6">
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Enter skill name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <PopoverRoot open={isIconPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={IconComponent}
                    onClick={() => setIsIconPickerOpen(true)}
                  />
                </PopoverTrigger>
                <PopoverContent
                  className="w-fit py-0"
                  onInteractOutside={() => setIsIconPickerOpen(false)}
                  onEscapeKeyDown={() => setIsIconPickerOpen(false)}
                >
                  <IconPicker
                    icons={ActionIcons}
                    selectedIcon={selectedIconName}
                    onIconSelect={(iconName: string) => {
                      setIcon(iconName);
                      setIsIconPickerOpen(false);
                    }}
                  />
                </PopoverContent>
              </PopoverRoot>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="userFacingDescription">Description</Label>
              <Input
                id="userFacingDescription"
                placeholder="Enter skill description"
                value={userFacingDescription}
                onChange={(e) => setUserFacingDescription(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="agentFacingDescription">
                What will this skill be used for?
              </Label>
              <TextArea
                id="agentFacingDescription"
                placeholder="When should this skill be used? What is this skill good for?"
                value={agentFacingDescription}
                onChange={(e) => setAgentFacingDescription(e.target.value)}
                minRows={3}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="instructions">
                What guidelines should it provide?
              </Label>
              <TextArea
                id="instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                minRows={8}
                placeholder="What does this skill do? How should it behave?"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>MCP Servers</Label>
                <DropdownMenu
                  modal={false}
                  onOpenChange={(open) => {
                    if (!open) {
                      setMcpSearchText("");
                    }
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      icon={PlusIcon}
                      variant="outline"
                      label="Add"
                      isSelect
                      size="xs"
                      disabled={isMcpServerViewsLoading}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-80">
                    <DropdownMenuSearchbar
                      autoFocus
                      placeholder="Search MCP servers..."
                      name="mcp-search"
                      value={mcpSearchText}
                      onChange={setMcpSearchText}
                    />
                    <DropdownMenuSeparator />
                    <div className="max-h-60 overflow-auto">
                      {filteredMcpServerViews.map((view) => {
                        const displayName = getMcpServerViewDisplayName(view);
                        const isSelected = selectedMcpServerViews.some(
                          (v) => v.sId === view.sId
                        );
                        return (
                          <DropdownMenuCheckboxItem
                            key={view.sId}
                            label={displayName}
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedMcpServerViews((prev) => [
                                  ...prev,
                                  view,
                                ]);
                              } else {
                                setSelectedMcpServerViews((prev) =>
                                  prev.filter((v) => v.sId !== view.sId)
                                );
                              }
                            }}
                            onSelect={(e) => e.preventDefault()}
                          />
                        );
                      })}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {selectedMcpServerViews.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedMcpServerViews.map((view) => (
                    <Chip
                      key={view.sId}
                      label={getMcpServerViewDisplayName(view)}
                      size="xs"
                      onRemove={() =>
                        setSelectedMcpServerViews((prev) =>
                          prev.filter((v) => v.sId !== view.sId)
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                label="Cancel"
                onClick={handleClose}
                disabled={isSubmitting}
              />
              <Button
                variant="primary"
                label={isSubmitting ? "Creating..." : "Create suggestion"}
                onClick={handleSubmit}
                disabled={
                  isSubmitting ||
                  !name.trim() ||
                  !userFacingDescription.trim() ||
                  !agentFacingDescription.trim() ||
                  !instructions.trim()
                }
              />
            </div>
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
