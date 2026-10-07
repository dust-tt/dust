import { SuggestedChangeRow } from "@app/components/shared/SuggestedChangeRow";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { SkillFilesSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { Avatar, File02, LoadingBlock } from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";

interface SuggestedSkillFilesProps {
  suggestion: SkillFilesSuggestionType;
  skillId: string;
  workspaceId: string;
}

export function SuggestedSkillFiles({
  suggestion,
  skillId,
  workspaceId,
}: SuggestedSkillFilesProps) {
  const { skill, isSkillLoading } = useSkill({ workspaceId, skillId });

  if (isSkillLoading) {
    return <LoadingBlock className="h-16 w-full" />;
  }

  const fileNameById = new Map(
    (skill?.fileAttachments ?? []).map((file) => [file.fileId, file.fileName])
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">
        <Trans>Files</Trans>
      </span>
      <div className="divide-y divide-border">
        {suggestion.addFilePaths.map((filePath) => (
          <SuggestedChangeRow
            key={`add-${filePath}`}
            action="add"
            visual={<Avatar size="xs" icon={File02} />}
            title={filePath.split("/").pop() ?? filePath}
          />
        ))}
        {suggestion.removeFileIds.map((fileId) => (
          <SuggestedChangeRow
            key={`remove-${fileId}`}
            action="remove"
            visual={<Avatar size="xs" icon={File02} />}
            title={fileNameById.get(fileId) ?? fileId}
          />
        ))}
      </div>
    </div>
  );
}
