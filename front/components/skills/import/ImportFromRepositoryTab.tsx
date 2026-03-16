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
import { useController, useFormContext } from "react-hook-form";

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
  const { control, setValue } = useFormContext<ImportFormValues>();
  const { field: repoUrlField } = useController({ name: "repoUrl", control });

  const { detectedSkills, isDetecting, detectError, triggerDetect } =
    useDetectSkillsFromRepo({ owner });

  // Pre-select all importable skills when detection completes. detectedSkills come
  // from an async SWR hook (useDetectSkillsFromRepo), so the values don't exist at
  // form initialization time and can't be provided as defaultValues.
  useEffect(() => {
    setValue(
      "selectedSkillNames",
      detectedSkills
        .filter((skill) => isImportableSkillStatus(skill.status))
        .map((skill) => skill.name)
    );
  }, [detectedSkills, setValue]);

  // Sync detecting state to the parent. Expects a stable callback (e.g. setState).
  useEffect(() => {
    onDetectingChange(isDetecting);
  }, [isDetecting, onDetectingChange]);

  useEffect(() => {
    onDetectedCountChange(detectedSkills.length);
  }, [detectedSkills.length, onDetectedCountChange]);

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
        isDetecting={isDetecting}
        detectError={detectError}
      />
    </div>
  );
}
