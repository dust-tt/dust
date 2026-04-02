import type { ImportFormValues } from "@app/components/skills/import/formSchema";
import type { DetectedSkillSummary } from "@app/lib/skill_detection";
import {
  type DetectedSkillStatus,
  isImportableSkillStatus,
} from "@app/lib/skill_detection";
import {
  Checkbox,
  Chip,
  cn,
  ContentMessage,
  ContextItem,
  InformationCircleIcon,
  Label,
  PuzzleIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useRef, useState } from "react";
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
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollIndicator = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
  }, []);

  const scrollCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      const prev = scrollRef.current;
      if (prev) {
        prev.removeEventListener("scroll", updateScrollIndicator);
      }
      scrollRef.current = node;
      if (node) {
        node.addEventListener("scroll", updateScrollIndicator);
        // Check on mount (after layout).
        requestAnimationFrame(updateScrollIndicator);
      }
    },
    [updateScrollIndicator]
  );

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
                title=""
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
          <div className="relative max-h-64 overflow-hidden">
            <div
              ref={scrollCallbackRef}
              className="max-h-64 overflow-y-auto"
            >
              <ContextItem.List>
                {detectedSkills.map((skill) => (
                  <ContextItem
                    key={skill.name}
                    title={
                      <Label
                        className="text-sm font-normal"
                        htmlFor={skill.name}
                      >
                        {skill.name}
                      </Label>
                    }
                    visual={
                      <div className="flex items-center gap-2">
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
            </div>
            <div
              className={cn(
                "pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t",
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
