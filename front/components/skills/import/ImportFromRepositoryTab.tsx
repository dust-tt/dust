import { DetectedSkillsList } from "@app/components/skills/import/DetectedSkillsList";
import type { ImportFormValues } from "@app/components/skills/import/formSchema";
import {
  isImportableSkillStatus,
  parseGitHubRepoUrl,
} from "@app/lib/skill_detection";
import { useDetectSkillsFromRepo } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import { Input } from "@dust-tt/sparkle";
import { useEffect } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

interface ImportFromRepositoryTabProps {
  owner: LightWorkspaceType;
  onDetectingChange: (isDetecting: boolean) => void;
  onDetectedCountChange: (count: number) => void;
  isImporting: boolean;
}

export function ImportFromRepositoryTab({
  owner,
  onDetectingChange,
  onDetectedCountChange,
  isImporting,
}: ImportFromRepositoryTabProps) {
  const { control } = useFormContext<ImportFormValues>();
  const { field: repoUrlField } = useController({ name: "repoUrl", control });
  const { field: selectedField } = useController({ name: "selectedSkillNames", control });
  const selectedSkillNames = useWatch({ control, name: "selectedSkillNames" });

  const { detectedSkills, isDetecting, detectError, triggerDetect } =
    useDetectSkillsFromRepo({ owner });

  // Pre-select all importable skills when detection completes.
  useEffect(() => {
    selectedField.onChange(detectedSkills
      .filter((skill) => isImportableSkillStatus(skill.status))
      .map((skill) => skill.name));
  }, [detectedSkills, selectedField]);

  // Sync detecting state to the parent. Expects a stable callback (e.g. setState).
  useEffect(() => {
    onDetectingChange(isDetecting);
  }, [isDetecting, onDetectingChange]);

  useEffect(() => {
    onDetectedCountChange(detectedSkills.length);
  }, [detectedSkills.length, onDetectedCountChange]);

  const toggleSkill = (name: string) => {
    if (selectedSkillNames.includes(name)) {
      selectedField.onChange(selectedSkillNames.filter((n) => n !== name));
    } else {
      selectedField.onChange([...selectedSkillNames, name]);
    }
  };

  return (
    <div className="flex flex-col gap-3 pt-4">
      <Input
        name={repoUrlField.name}
        ref={repoUrlField.ref}
        value={repoUrlField.value}
        onChange={(e) => {
          const trimmed = e.target.value.trim();
          repoUrlField.onChange(trimmed);
          if (trimmed && parseGitHubRepoUrl(trimmed).isOk()) {
            triggerDetect(trimmed);
          }
        }}
        onBlur={repoUrlField.onBlur}
        placeholder="https://github.com/owner/repo"
        disabled={isImporting}
      />
      <DetectedSkillsList
        detectedSkills={detectedSkills}
        selectedNames={selectedSkillNames}
        toggleSkill={toggleSkill}
        isDetecting={isDetecting}
        detectError={detectError}
      />
    </div>
  );
}
