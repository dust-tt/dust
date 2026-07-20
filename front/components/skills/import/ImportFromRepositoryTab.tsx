import { ConnectWorkspaceGitHubMessage } from "@app/components/skills/import/ConnectWorkspaceGitHubMessage";
import { DetectedSkillsList } from "@app/components/skills/import/DetectedSkillsList";
import type { RepositoryImportFormValues } from "@app/components/skills/import/formSchema";
import { GitHubConnectionRow } from "@app/components/skills/import/GitHubConnectionRow";
import {
  isImportableSkillStatus,
  parseGitHubRepoUrl,
} from "@app/lib/skill_detection";
import { useWorkspaceGitHubConnection } from "@app/lib/swr/github_connection";
import { useDetectSkillsFromRepo } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import { ContentMessage, InfoCircle, Input } from "@dust-tt/sparkle";
import { useEffect } from "react";
import { useController, useFormContext } from "react-hook-form";

interface ImportFromRepositoryTabProps {
  owner: LightWorkspaceType;
  isActive: boolean;
  onDetectingChange: (isDetecting: boolean) => void;
  onDetectedCountChange: (count: number) => void;
  isImporting: boolean;
}

export function ImportFromRepositoryTab({
  owner,
  isActive,
  onDetectingChange,
  onDetectedCountChange,
  isImporting,
}: ImportFromRepositoryTabProps) {
  const { control, setValue } = useFormContext<RepositoryImportFormValues>();
  const { field: repoUrlField } = useController({ name: "repoUrl", control });

  const {
    detectedSkills,
    isDetecting,
    detectError,
    repositoryNotFound,
    triggerDetect,
    retryDetect,
  } = useDetectSkillsFromRepo({ owner });

  const { connection, isConnectionLoading, mutateConnection } =
    useWorkspaceGitHubConnection({
      owner,
      disabled: !isActive,
    });

  // Re-sync selected skills when detection completes or when this tab becomes active.
  // detectedSkills come from an async hook, so values don't exist at form init time.
  useEffect(() => {
    if (!isActive) {
      return;
    }
    setValue(
      "selectedSkillNames",
      detectedSkills
        .filter((skill) => isImportableSkillStatus(skill.status))
        .map((skill) => skill.name)
    );
  }, [isActive, detectedSkills, setValue]);

  // Sync detecting state to the parent. Expects a stable callback (e.g. setState).
  useEffect(() => {
    onDetectingChange(isDetecting);
  }, [isDetecting, onDetectingChange]);

  useEffect(() => {
    onDetectedCountChange(detectedSkills.length);
  }, [detectedSkills.length, onDetectedCountChange]);

  const showRepositoryNotFound = repositoryNotFound && !isConnectionLoading;

  let repositoryContent = (
    <DetectedSkillsList
      detectedSkills={detectedSkills}
      isDetecting={isDetecting}
      detectError={detectError}
    />
  );
  if (showRepositoryNotFound && connection) {
    repositoryContent = (
      <ContentMessage
        variant="warning"
        size="lg"
        icon={InfoCircle}
        title="GitHub connection can't access this repository"
      >
        The currently connected GitHub account can't access this repository.{" "}
        {isAdmin(owner)
          ? "Reconnect with an account that has access."
          : "Ask an admin to reconnect with an account that has access."}
      </ContentMessage>
    );
  } else if (showRepositoryNotFound && isAdmin(owner)) {
    repositoryContent = (
      <ConnectWorkspaceGitHubMessage
        owner={owner}
        onConnected={() => {
          void mutateConnection();
          retryDetect(repoUrlField.value);
        }}
      />
    );
  } else if (showRepositoryNotFound) {
    repositoryContent = (
      <ContentMessage
        variant="warning"
        size="lg"
        icon={InfoCircle}
        title="Repository not found"
      >
        Check the URL. For private repos, ask an admin to connect a GitHub
        account with access.
      </ContentMessage>
    );
  }

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
        className="bg-muted-background"
      />

      {repositoryContent}

      {connection && (
        <GitHubConnectionRow
          owner={owner}
          connection={connection}
          onDisconnected={() => {
            void mutateConnection();
            retryDetect(repoUrlField.value);
          }}
        />
      )}
    </div>
  );
}
