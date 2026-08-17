import { editorVariants } from "@app/components/editor/editorStyles";
import {
  isSkillSlashCommand,
  isToolSlashCommand,
  SELECT_SKILL_SLASH_COMMAND_ACTION,
  SELECT_TOOL_SLASH_COMMAND_ACTION,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { buildCapabilitySlashCommandItems } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import {
  SkillInstructionsEditorContent,
  useSkillInstructionsEditor,
} from "@app/components/editor/SkillInstructionsEditor";
import {
  getMcpServerViewDisplayName,
  isToolWithKnowledge,
} from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { PokeMCPServerViewListItemType } from "@app/lib/api/poke/mcp_server_views";
import { postProcessMarkdown } from "@app/lib/editor/skill_instructions_preprocessing";
import {
  SKILL_INSTRUCTIONS_LABEL,
  SKILL_INVOCATION_LABEL,
} from "@app/lib/skills/labels";
import { extractToolTags } from "@app/lib/tools/format";
import { usePokeMCPServerViews } from "@app/poke/swr/mcp_server_views";
import {
  useCreatePokeSkillSuggestion,
  usePokeSkills,
} from "@app/poke/swr/skills";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionIcons,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconPicker,
  Input,
  Label,
  Plus,
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
import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [capabilitySearchText, setCapabilitySearchText] = useState("");

  const { data: skills, isLoading: isSkillsLoading } = usePokeSkills({
    owner,
    disabled: !show,
  });
  const { data: mcpServerViews, isLoading: isMCPServerViewsLoading } =
    usePokeMCPServerViews({
      owner,
      disabled: !show,
      globalSpaceOnly: true,
    });

  const activeSkills = useMemo(
    () => skills.filter((skill) => skill.status === "active"),
    [skills]
  );

  const selectableMCPServerViews = useMemo(() => {
    const serverViewCountByServerId = new Map<string, number>();
    for (const view of mcpServerViews) {
      serverViewCountByServerId.set(
        view.server.sId,
        (serverViewCountByServerId.get(view.server.sId) ?? 0) + 1
      );
    }

    return mcpServerViews
      .filter((view) => {
        const { availability } = view.server;
        return (
          (availability === "manual" || availability === "auto") &&
          !isToolWithKnowledge(view) &&
          getMCPServerRequirements(view).noRequirement
        );
      })
      .map((view) => ({
        ...view,
        label:
          (serverViewCountByServerId.get(view.server.sId) ?? 0) > 1
            ? `${getMcpServerViewDisplayName(view)} (${view.space.name})`
            : getMcpServerViewDisplayName(view),
      }));
  }, [mcpServerViews]);

  const capabilityItems = useMemo(
    () =>
      buildCapabilitySlashCommandItems({
        query: capabilitySearchText,
        skills: activeSkills,
        tools: selectableMCPServerViews,
      }),
    [activeSkills, capabilitySearchText, selectableMCPServerViews]
  );
  const skillItems = capabilityItems.filter(
    (item) => item.action === SELECT_SKILL_SLASH_COMMAND_ACTION
  );
  const toolItems = capabilityItems.filter(
    (item) => item.action === SELECT_TOOL_SLASH_COMMAND_ACTION
  );
  const isCapabilitiesLoading = isSkillsLoading || isMCPServerViewsLoading;

  const handleInstructionsUpdate = useCallback(
    ({ editor, transaction }: { editor: Editor; transaction: Transaction }) => {
      if (transaction.docChanged) {
        setInstructions(postProcessMarkdown(editor.getMarkdown()).trim());
      }
    },
    []
  );

  const { editor } = useSkillInstructionsEditor({
    content: "",
    enableSlashCommands: false,
    isReadOnly: false,
    onUpdate: handleInstructionsUpdate,
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setOptions({
      editorProps: {
        attributes: {
          "aria-label": SKILL_INSTRUCTIONS_LABEL,
          class: cn(editorVariants(), "min-h-48 max-h-[50vh]"),
        },
      },
    });
  }, [editor]);

  const resetForm = () => {
    setName("");
    setUserFacingDescription("");
    setAgentFacingDescription("");
    setInstructions("");
    setIcon(null);
    setCapabilitySearchText("");
    editor?.commands.clearContent();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const { createSkillSuggestion } = useCreatePokeSkillSuggestion({
    owner,
    onSuccess: handleClose,
  });

  const handleSubmit = async () => {
    const serializedInstructions = editor
      ? postProcessMarkdown(editor.getMarkdown()).trim()
      : instructions.trim();

    setIsSubmitting(true);
    await createSkillSuggestion({
      name: name.trim(),
      userFacingDescription: userFacingDescription.trim(),
      agentFacingDescription: agentFacingDescription.trim(),
      instructions: serializedInstructions,
      icon: icon ?? null,
      mcpServerViewIds: [
        ...new Set(
          extractToolTags(serializedInstructions).map((tag) => tag.id)
        ),
      ],
    });
    setIsSubmitting(false);
  };

  const handleInsertCapability = (item: SlashCommand) => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    if (isSkillSlashCommand(item)) {
      editor
        .chain()
        .focus()
        .insertSkillNode({
          skillId: item.data.skill.sId,
          skillIcon: item.data.skill.icon,
          skillName: item.data.skill.name,
        })
        .run();
      return;
    }

    if (isToolSlashCommand<PokeMCPServerViewListItemType>(item)) {
      editor
        .chain()
        .focus()
        .insertToolNode({
          mcpServerViewId: item.data.tool.id,
          toolIcon: item.data.tool.icon,
          toolName: item.data.tool.name,
        })
        .run();
    }
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
                  className="w-fit p-0"
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
                {SKILL_INVOCATION_LABEL}
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
              <div className="flex items-center justify-between">
                <Label>{SKILL_INSTRUCTIONS_LABEL}</Label>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      icon={Plus}
                      variant="outline"
                      label="Add"
                      isSelect
                      size="xs"
                      disabled={!editor || isCapabilitiesLoading}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-80"
                    onAnimationEnd={() => setCapabilitySearchText("")}
                  >
                    <DropdownMenuSearchbar
                      autoFocus
                      placeholder="Search tools and skills..."
                      name="capability-search"
                      value={capabilitySearchText}
                      onChange={setCapabilitySearchText}
                    />
                    <DropdownMenuSeparator />
                    <div className="max-h-72 overflow-auto">
                      {isCapabilitiesLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Spinner size="sm" />
                        </div>
                      ) : capabilityItems.length === 0 ? (
                        <div className="p-3 text-center text-sm text-muted-foreground">
                          No tools or skills found.
                        </div>
                      ) : (
                        <>
                          {skillItems.length > 0 && (
                            <>
                              <DropdownMenuLabel
                                label="Skills"
                                className="pl-3"
                              />
                              {skillItems.map((item) => (
                                <DropdownMenuItem
                                  key={item.id}
                                  className="pl-3"
                                  label={item.label}
                                  description={item.description}
                                  icon={item.icon}
                                  onSelect={() => handleInsertCapability(item)}
                                />
                              ))}
                            </>
                          )}
                          {skillItems.length > 0 && toolItems.length > 0 && (
                            <DropdownMenuSeparator />
                          )}
                          {toolItems.length > 0 && (
                            <>
                              <DropdownMenuLabel
                                label="Tools"
                                className="pl-3"
                              />
                              {toolItems.map((item) => (
                                <DropdownMenuItem
                                  key={item.id}
                                  className="pl-3"
                                  label={item.label}
                                  description={item.description}
                                  icon={item.icon}
                                  onSelect={() => handleInsertCapability(item)}
                                />
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="group relative overflow-hidden rounded-xl p-px">
                <SkillInstructionsEditorContent
                  editor={editor}
                  isReadOnly={false}
                />
              </div>
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
                  !instructions.trim() ||
                  !editor
                }
              />
            </div>
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
