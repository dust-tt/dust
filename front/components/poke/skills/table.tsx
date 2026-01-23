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
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  useCreatePokeSkillSuggestion,
  usePokeSkills,
} from "@app/poke/swr/skills";
import type { LightWorkspaceType } from "@app/types";

const AUTO_INTERNAL_MCP_SERVER_NAMES: AutoInternalMCPServerNameType[] =
  Object.entries(INTERNAL_MCP_SERVERS)
    .filter(([, server]) => server.availability === "auto")
    .map(([name]) => name as AutoInternalMCPServerNameType)
    .sort();

interface SkillsDataTableProps {
  owner: LightWorkspaceType;
  loadOnInit?: boolean;
}

export function SkillsDataTable({ owner, loadOnInit }: SkillsDataTableProps) {
  const [showCreateSuggestionSheet, setShowCreateSuggestionSheet] =
    useState(false);

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
}

function CreateSkillSuggestionSheet({
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
  const [selectedMcpServers, setSelectedMcpServers] = useState<
    AutoInternalMCPServerNameType[]
  >([]);
  const [mcpSearchText, setMcpSearchText] = useState("");

  const resetForm = () => {
    setName("");
    setUserFacingDescription("");
    setAgentFacingDescription("");
    setInstructions("");
    setIcon(null);
    setSelectedMcpServers([]);
    setMcpSearchText("");
  };

  const { createSkillSuggestion } = useCreatePokeSkillSuggestion({
    owner,
    onSuccess: () => {
      resetForm();
      onClose();
    },
  });

  const filteredMcpServers = useMemo(() => {
    return AUTO_INTERNAL_MCP_SERVER_NAMES.filter((name) =>
      name.toLowerCase().includes(mcpSearchText.toLowerCase())
    );
  }, [mcpSearchText]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await createSkillSuggestion({
      name: name.trim(),
      userFacingDescription: userFacingDescription.trim(),
      agentFacingDescription: agentFacingDescription.trim(),
      instructions: instructions.trim(),
      icon: icon ?? null,
      mcpServerNames: selectedMcpServers,
    });
    setIsSubmitting(false);
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
                      {filteredMcpServers.map((serverName) => (
                        <DropdownMenuCheckboxItem
                          key={serverName}
                          label={serverName}
                          checked={selectedMcpServers.includes(serverName)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedMcpServers((prev) => [
                                ...prev,
                                serverName,
                              ]);
                            } else {
                              setSelectedMcpServers((prev) =>
                                prev.filter((s) => s !== serverName)
                              );
                            }
                          }}
                          onSelect={(e) => e.preventDefault()}
                        />
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {selectedMcpServers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedMcpServers.map((serverName) => (
                    <Chip
                      key={serverName}
                      label={serverName}
                      size="xs"
                      onRemove={() =>
                        setSelectedMcpServers((prev) =>
                          prev.filter((s) => s !== serverName)
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
