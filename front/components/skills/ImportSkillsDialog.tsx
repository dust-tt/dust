import {
  isImportableSkillStatus,
  type DetectedSkillStatus,
} from "@app/lib/skill";
import { parseGitHubRepoUrl } from "@app/lib/api/skills/github_detection/parsing";
import {
  useDetectSkillsFromRepo,
  useImportSkills,
} from "@app/lib/swr/skill_configurations";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Checkbox,
  Chip,
  ContentMessage,
  ContextItem,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InformationCircleIcon,
  Input,
  PuzzleIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

interface ImportSkillsDialogProps {
  onClose: () => void;
  owner: LightWorkspaceType;
}

const STATUS_CHIP_LABEL: Record<
  Exclude<DetectedSkillStatus, "ready">,
  string
> = {
  name_conflict: "Skill name already in use",
  same_source_conflict: "Will override existing skill",
  invalid: "Invalid skill format",
};

export function ImportSkillsDialog({
  onClose,
  owner,
}: ImportSkillsDialogProps) {
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

  const handleImport = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      if (selectedNames.size === 0) {
        return;
      }

      const result = await importSkills(repoUrl, [...selectedNames]);
      if (result.successCount > 0) {
        onClose();
      }
    },
    [repoUrl, selectedNames, importSkills, onClose]
  );

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

  const selectedCount = selectedNames.size;
  const hasDetectedSkills = detectedSkills.length > 0;

  const description = hasDetectedSkills
    ? `${detectedSkills.length} skill${pluralize(detectedSkills.length)} detected. Select the ones to import.`
    : "Enter a GitHub repository URL to detect skills.";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import skills from GitHub</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogContainer>
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
          {hasDetectedSkills && (
            <ContextItem.List>
              {detectedSkills.map((skill) => (
                <ContextItem
                  key={skill.name}
                  title={
                    <span className="text-sm font-normal">{skill.name}</span>
                  }
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
                          skill.status === "same_source_conflict"
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
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            disabled: isDetecting || isImporting,
          }}
          rightButtonProps={{
            label: "Import",
            disabled: isImporting || selectedCount === 0,
            onClick: handleImport,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
