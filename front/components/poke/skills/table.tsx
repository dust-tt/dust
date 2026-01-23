import {
  ActionIcons,
  Button,
  IconPicker,
  Input,
  Label,
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
import { useState } from "react";

import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForSkills } from "@app/components/poke/skills/columns";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { usePokeSkills } from "@app/poke/swr/skills";
import type { LightWorkspaceType } from "@app/types";

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
  const router = useAppRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  const [name, setName] = useState("");
  const [userFacingDescription, setUserFacingDescription] = useState("");
  const [agentFacingDescription, setAgentFacingDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [icon, setIcon] = useState<string>("ActionListCheckIcon");

  const resetForm = () => {
    setName("");
    setUserFacingDescription("");
    setAgentFacingDescription("");
    setInstructions("");
    setIcon("ActionListCheckIcon");
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      window.alert("Name is required");
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
          icon: icon || null,
        }),
      }
    );
    setIsSubmitting(false);

    if (!response.ok) {
      const errorData = await getErrorFromResponse(response);
      window.alert(`Failed to create skill suggestion. ${errorData.message}`);
    } else {
      resetForm();
      onClose();
      router.reload();
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
          onClose();
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

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                label="Cancel"
                onClick={onClose}
                disabled={isSubmitting}
              />
              <Button
                variant="primary"
                label={isSubmitting ? "Creating..." : "Create suggestion"}
                onClick={handleSubmit}
                disabled={isSubmitting || !name.trim()}
              />
            </div>

            {isSubmitting && (
              <div className="flex items-center justify-center">
                <Spinner />
              </div>
            )}
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
