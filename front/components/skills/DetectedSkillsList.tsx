import {
  type DetectedSkillStatus,
  isImportableSkillStatus,
} from "@app/lib/skill_detection";
import type { DetectedSkillSummary } from "@app/lib/skill_detection";
import {
  Checkbox,
  Chip,
  ContentMessage,
  ContextItem,
  InformationCircleIcon,
  PuzzleIcon,
  Spinner,
} from "@dust-tt/sparkle";

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
  selectedNames: Set<string>;
  toggleSkill: (name: string) => void;
  isDetecting: boolean;
  detectError: string | null;
}

export function DetectedSkillsList({
  detectedSkills,
  selectedNames,
  toggleSkill,
  isDetecting,
  detectError,
}: DetectedSkillsListProps) {
  return (
    <>
      {detectError && (
        <ContentMessage
          title="Detection failed"
          icon={InformationCircleIcon}
          variant="rose"
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
              title={<span className="text-sm font-normal">{skill.name}</span>}
              visual={
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedNames.has(skill.name)}
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
