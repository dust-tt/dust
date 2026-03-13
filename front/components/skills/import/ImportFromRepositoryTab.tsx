import { DetectedSkillsList } from "@app/components/skills/import/DetectedSkillsList";
import type { ImportFormValues } from "@app/components/skills/import/formSchema";
import {
  isImportableSkillStatus,
  parseGitHubRepoUrl,
} from "@app/lib/skill_detection";
import { useDetectSkillsFromRepo } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import { Input } from "@dust-tt/sparkle";
import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";
import { useController, useFormContext } from "react-hook-form";

interface ImportFromRepositoryTabProps {
  owner: LightWorkspaceType;
  selectedNames: Set<string>;
  setSelectedNames: Dispatch<SetStateAction<Set<string>>>;
  onDetectingChange: (isDetecting: boolean) => void;
  isImporting: boolean;
}

export function ImportFromRepositoryTab({
  owner,
  selectedNames,
  setSelectedNames,
  onDetectingChange,
  isImporting,
}: ImportFromRepositoryTabProps) {
  const { control } = useFormContext<ImportFormValues>();
  const { field } = useController({ name: "repoUrl", control });

  const { detectedSkills, isDetecting, detectError, triggerDetect } =
    useDetectSkillsFromRepo({ owner });

  // Pre-select all importable skills when detection completes.
  useEffect(() => {
    const initial = new Set<string>();
    for (const skill of detectedSkills) {
      if (isImportableSkillStatus(skill.status)) {
        initial.add(skill.name);
      }
    }
    setSelectedNames(initial);
  }, [detectedSkills, setSelectedNames]);

  // Report detecting state to the parent dialog.
  useEffect(() => {
    onDetectingChange(isDetecting);
  }, [isDetecting, onDetectingChange]);

  const toggleSkill = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  return (
    <div className="pt-2">
      <Input
        name={field.name}
        ref={field.ref}
        value={field.value}
        onChange={(e) => {
          const trimmed = e.target.value.trim();
          field.onChange(trimmed);
          if (trimmed && parseGitHubRepoUrl(trimmed).isOk()) {
            triggerDetect(trimmed);
          }
        }}
        onBlur={field.onBlur}
        placeholder="https://github.com/owner/repo"
        disabled={isImporting}
      />
      <DetectedSkillsList
        detectedSkills={detectedSkills}
        selectedNames={selectedNames}
        toggleSkill={toggleSkill}
        isDetecting={isDetecting}
        detectError={detectError}
      />
    </div>
  );
}
