import type { ImportFormValues } from "@app/components/skills/import/formSchema";
import type { DetectedSkillSummary } from "@app/lib/skill_detection";
import {
  type DetectedSkillStatus,
  isImportableSkillStatus,
} from "@app/lib/skill_detection";
import {
  Checkbox,
  Chip,
  ContentMessage,
  ContextItem,
  InformationCircleIcon,
  Label,
  PuzzleIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useController, useFormContext } from "react-hook-form";

const STATUS_CHIP_LABEL: Record<
  Exclude<DetectedSkillStatus, "ready">,
  string
> = {
  name_conflict: "Skill name already in use",
  skill_already_exists: "Override existing skill",
  invalid: "Invalid skill format",
};

interface DetectedSkillsListProps {
  detectedSkills: DetectedSkillSummary[];
  isDetecting: boolean;
  detectError: string | null;
}

export function DetectedSkillsList({
  detectedSkills,
  isDetecting,
  detectError,
}: DetectedSkillsListProps) {
  const { control } = useFormContext<ImportFormValues>();
  const { field: selectedField } = useController({
    name: "selectedSkillNames",
    control,
  });

  const toggleSkill = (name: string) => {
    if (selectedField.value.includes(name)) {
      selectedField.onChange(selectedField.value.filter((n) => n !== name));
    } else {
      selectedField.onChange([...selectedField.value, name]);
    }
  };

  return (
    <>
      {detectError && (
        <ContentMessage
          title="Detection failed"
          icon={InformationCircleIcon}
          variant="warning"
          size="lg"
        >
          {detectError}
        </ContentMessage>
      )}
      {isDetecting && (
        <div className="flex items-center justify-center py-4">
          <Spinner size="md" />
        </div>
      )}
      {detectedSkills.length > 0 && (
        <ContextItem.List>
          {detectedSkills.map((skill) => (
            <ContextItem
              key={skill.name}
              title={
                <Label className="text-sm font-normal" htmlFor={skill.name}>
                  {skill.name}
                </Label>
              }
              visual={
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={skill.name}
                    checked={selectedField.value.includes(skill.name)}
                    disabled={!isImportableSkillStatus(skill.status)}
                    onCheckedChange={() => toggleSkill(skill.name)}
                  />
                  <ContextItem.Visual visual={PuzzleIcon} />
                </div>
              }
              action={
                skill.status !== "ready" ? (
                  <Chip
                    label={STATUS_CHIP_LABEL[skill.status]}
                    size="xs"
                    color={
                      skill.status === "skill_already_exists"
                        ? "info"
                        : "warning"
                    }
                  />
                ) : undefined
              }
            />
          ))}
        </ContextItem.List>
      )}
    </>
  );
}
