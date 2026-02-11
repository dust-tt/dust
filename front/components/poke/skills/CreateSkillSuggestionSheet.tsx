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
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { usePokeMCPServerViews } from "@app/poke/swr/mcp_server_views";
import { useCreatePokeSkillSuggestion } from "@app/poke/swr/skills";
import type { LightWorkspaceType } from "@app/types/user";

const DEFAULT_ICON: keyof typeof ActionIcons = "ActionListCheckIcon";

function isValidIcon(icon: string | null): icon is keyof typeof ActionIcons {
  return icon ? icon in ActionIcons : false;
}

interface CreateSkillSuggestionSheetProps {
  show: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function CreateSkillSuggestionSheet({
  show,
  onClose,
  owner,
}: CreateSkillSuggestionSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  const [name, setName] = useState("");
  const [userFacingDescription, setUserFacingDescription] = useState("");
  const [agentFacingDescription, setAgentFacingDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [selectedMCPServerViews, setSelectedMCPServerViews] = useState<
    MCPServerViewType[]
  >([]);
  const [mcpSearchText, setMCPSearchText] = useState("");

  const { data: allMCPServerViews, isLoading: isMCPServerViewsLoading } =
    usePokeMCPServerViews({ owner, disabled: !show, globalSpaceOnly: true });

  // Filter to match the skill builder behavior:
  // - Only "manual" and "auto" availability
  // - Only views that don't require configuration
  const noConfigMCPServerViews = useMemo(() => {
    return allMCPServerViews.filter((view) => {
      const { availability } = view.server;
      if (availability !== "manual" && availability !== "auto") {
        return false;
      }
      const { noRequirement } = getMCPServerRequirements(view);
      return noRequirement;
    });
  }, [allMCPServerViews]);

  const resetForm = () => {
    setName("");
    setUserFacingDescription("");
    setAgentFacingDescription("");
    setInstructions("");
    setIcon(null);
    setSelectedMCPServerViews([]);
    setMCPSearchText("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const { createSkillSuggestion } = useCreatePokeSkillSuggestion({
    owner,
    onSuccess: handleClose,
  });

  const filteredMcpServerViews = useMemo(() => {
    return noConfigMCPServerViews.filter((view) =>
      getMcpServerViewDisplayName(view)
        .toLowerCase()
        .includes(mcpSearchText.toLowerCase())
    );
  }, [noConfigMCPServerViews, mcpSearchText]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await createSkillSuggestion({
      name: name.trim(),
      userFacingDescription: userFacingDescription.trim(),
      agentFacingDescription: agentFacingDescription.trim(),
      instructions: instructions.trim(),
      icon: icon ?? null,
      mcpServerViewIds: selectedMCPServerViews.map((v) => v.sId),
    });
    setIsSubmitting(false);
  };

  const selectedIconName = isValidIcon(icon) ? icon : DEFAULT_ICON;

  const IconComponent = ActionIcons[selectedIconName];

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
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      icon={PlusIcon}
                      variant="outline"
                      label="Add"
                      isSelect
                      size="xs"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-80"
                    onAnimationEnd={() => setMCPSearchText("")}
                  >
                    <DropdownMenuSearchbar
                      autoFocus
                      placeholder="Search MCP servers..."
                      name="mcp-search"
                      value={mcpSearchText}
                      onChange={setMCPSearchText}
                    />
                    <DropdownMenuSeparator />
                    <div className="max-h-60 overflow-auto">
                      {isMCPServerViewsLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Spinner size="sm" />
                        </div>
                      ) : (
                        filteredMcpServerViews.map((view) => (
                          <DropdownMenuCheckboxItem
                            key={view.sId}
                            label={getMcpServerViewDisplayName(view)}
                            checked={selectedMCPServerViews.some(
                              (v) => v.sId === view.sId
                            )}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedMCPServerViews((prev) => [
                                  ...prev,
                                  view,
                                ]);
                              } else {
                                setSelectedMCPServerViews((prev) =>
                                  prev.filter((v) => v.sId !== view.sId)
                                );
                              }
                            }}
                            onSelect={(e) => e.preventDefault()}
                          />
                        ))
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {selectedMCPServerViews.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedMCPServerViews.map((view) => (
                    <Chip
                      key={view.sId}
                      label={getMcpServerViewDisplayName(view)}
                      size="xs"
                      onRemove={() =>
                        setSelectedMCPServerViews((prev) =>
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
                variant="outline"
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
