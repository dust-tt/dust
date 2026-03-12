import { DetectedSkillsList } from "@app/components/skills/DetectedSkillsList";
import { isImportableSkillStatus } from "@app/lib/skill_detection";
import { parseGitHubRepoUrl } from "@app/lib/skill_detection";
import {
  useDetectSkillsFromRepo,
  useImportSkills,
} from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import { Input } from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

interface ImportFromRepositoryTabProps {
  owner: LightWorkspaceType;
  onStateChange: (state: {
    selectedCount: number;
    isDetecting: boolean;
    isImporting: boolean;
  }) => void;
  onImportSuccess: () => void;
  registerImportHandler: (handler: () => Promise<void>) => void;
}

export function ImportFromRepositoryTab({
  owner,
  onStateChange,
  onImportSuccess,
  registerImportHandler,
}: ImportFromRepositoryTabProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());

  const { detectedSkills, isDetecting, detectError, triggerDetect } =
    useDetectSkillsFromRepo({ owner });
  const { importSkills, isImporting } = useImportSkills({ owner });

  // Pre-select all importable skills when detection completes.
  useEffect(() => {
    const initial = new Set<string>();
    for (const skill of detectedSkills) {
      if (isImportableSkillStatus(skill.status)) {
        initial.add(skill.name);
      }
    }
    setSelectedNames(initial);
  }, [detectedSkills]);

  // Report state to parent.
  useEffect(() => {
    onStateChange({
      selectedCount: selectedNames.size,
      isDetecting,
      isImporting,
    });
  }, [selectedNames.size, isDetecting, isImporting, onStateChange]);

  // Register import handler with parent.
  const handleImport = useCallback(async () => {
    if (selectedNames.size === 0) {
      return;
    }
    const result = await importSkills(repoUrl, [...selectedNames]);
    if (result.successCount > 0) {
      onImportSuccess();
    }
  }, [selectedNames, repoUrl, importSkills, onImportSuccess]);

  useEffect(() => {
    registerImportHandler(handleImport);
  }, [handleImport, registerImportHandler]);

  const toggleSkill = useCallback((name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-4 pt-2">
      <Input
        placeholder="https://github.com/owner/repo"
        value={repoUrl}
        onChange={(e) => {
          const url = e.target.value;
          setRepoUrl(url.trim());
          const trimmed = url.trim();
          if (trimmed && parseGitHubRepoUrl(trimmed).isOk()) {
            triggerDetect(trimmed);
          }
        }}
        name="repoUrl"
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
