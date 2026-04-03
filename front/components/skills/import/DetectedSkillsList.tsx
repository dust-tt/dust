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
  cn,
  InformationCircleIcon,
  Label,
  PuzzleIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setCanScrollDown(!entry.isIntersecting),
      { root, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const { control } = useFormContext<ImportFormValues>();
  const { field: selectedField } = useController({
    name: "selectedSkillNames",
    control,
  });

  const importableNames = useMemo(
    () =>
      detectedSkills
        .filter((s) => isImportableSkillStatus(s.status))
        .map((s) => s.name),
    [detectedSkills]
  );

  const allSelected =
    importableNames.length > 0 &&
    importableNames.every((n) => selectedField.value.includes(n));

  const toggleAll = () => {
    if (allSelected) {
      selectedField.onChange([]);
    } else {
      selectedField.onChange(importableNames);
    }
  };

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
        <div className="flex flex-col">
          {importableNames.length > 1 && (
            <ContextItem.List>
              <ContextItem
                title="Skill name"
                visual={
                  <Checkbox
                    id="select-all-skills"
                    size="xs"
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                  />
                }
              />
            </ContextItem.List>
          )}
          <div ref={scrollRef} className="relative max-h-64 overflow-y-auto">
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
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={skill.name}
                        size="xs"
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
            <div ref={sentinelRef} className="h-px" />
            <div
              className={cn(
                "pointer-events-none sticky -bottom-px left-0 right-0 -mt-12 h-12 bg-gradient-to-t",
                "from-background via-background/60 to-transparent transition-opacity duration-300 dark:from-background-night dark:via-background-night/60",
                canScrollDown ? "opacity-100" : "opacity-0"
              )}
            />
          </div>
        </div>
      )}
    </>
  );
}
