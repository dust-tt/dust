import {
  SKILL_INSTRUCTIONS_LABEL,
  SKILL_INVOCATION_LABEL,
} from "@app/lib/skills/labels";
import { useCreatePokeSkillSuggestion } from "@app/poke/swr/skills";
import type { LightWorkspaceType } from "@app/types/user";
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
  TextArea,
} from "@dust-tt/sparkle";
import { useState } from "react";

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

  const resetForm = () => {
    setName("");
    setUserFacingDescription("");
    setAgentFacingDescription("");
    setInstructions("");
    setIcon(null);
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
    setIsSubmitting(true);
    await createSkillSuggestion({
      name: name.trim(),
      userFacingDescription: userFacingDescription.trim(),
      agentFacingDescription: agentFacingDescription.trim(),
      instructions: instructions.trim(),
      icon: icon ?? null,
      mcpServerViewIds: [],
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
              <Label htmlFor="instructions">{SKILL_INSTRUCTIONS_LABEL}</Label>
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
