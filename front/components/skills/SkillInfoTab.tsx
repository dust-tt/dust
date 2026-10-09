import {
  DetailsSectionHeading,
  EditedSectionBar,
} from "@app/components/assistant/details/DetailsSectionHeading";
import {
  useEditedSkillSections,
  useSkillSuggestionPreview,
} from "@app/components/assistant/details/SuggestionPreviewContext";
import { KnowledgeChip } from "@app/components/editor/extensions/skill_builder/KnowledgeChip";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import { isFullKnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import { SkillDescriptionReadOnlyEditor } from "@app/components/editor/SkillDescriptionEditor";
import { DiscoverableSkillsList } from "@app/components/skills/DiscoverableSkillsList";
import { RedactedSkillMessage } from "@app/components/skills/RedactedSkillMessage";
import { SkillInstructionsReadOnlyEditor } from "@app/components/skills/SkillInstructionsReadOnlyEditor";
import { RequestedSpacesSection } from "@app/components/spaces/RequestedSpacesSection";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type {
  SkillRelations,
  SkillType,
} from "@app/types/assistant/skill_configuration";
import type { EnrichedSpaceType } from "@app/types/space";
import { isFilesSkillSuggestion } from "@app/types/suggestions/skill_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { AttachmentChip, File02, Separator, Tooltip } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import sortBy from "lodash/sortBy";
import { useCallback, useMemo, useState } from "react";

interface SkillInfoTabProps {
  skill: SkillType & { relations?: Pick<SkillRelations, "childSkills"> };
  owner: LightWorkspaceType;
  spaces?: EnrichedSpaceType[];
  showDescription?: boolean;
}

export function SkillInfoTab({
  skill,
  owner,
  spaces,
  showDescription = true,
}: SkillInfoTabProps) {
  const { t } = useLingui();
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const editedSections = useEditedSkillSections();
  const previewSuggestions = useSkillSuggestionPreview();

  const showDiscoverableSkills = skill.sId === "discover_skills";
  const hasRequestedSpaces = skill.requestedSpaceIds.length > 0;

  const sortedMCPServerViews = useMemo(
    () => sortBy(skill.tools.map(renderMCPServerView), "title"),
    [skill.tools]
  );

  const childSkills = useMemo(
    () => sortBy(skill.relations?.childSkills ?? [], "name"),
    [skill.relations?.childSkills]
  );

  const showChildSkills = childSkills.length > 0;

  const handleKnowledgeItemsChange = useCallback((items: KnowledgeItem[]) => {
    setKnowledgeItems(items);
  }, []);

  // Files a previewed suggestion adds have no id until it is applied, so they are not part of the
  // skill's attachments.
  const addedFilePaths = useMemo(
    () =>
      previewSuggestions
        .filter(isFilesSkillSuggestion)
        .flatMap((s) => s.suggestion.addFilePaths),
    [previewSuggestions]
  );
  const hasFiles =
    skill.fileAttachments.length > 0 || addedFilePaths.length > 0;

  const hasInstructions = !!skill.instructions || !!skill.instructionsHtml;

  const showSeparator =
    hasInstructions ||
    knowledgeItems.length > 0 ||
    hasFiles ||
    sortedMCPServerViews.length > 0 ||
    showChildSkills ||
    showDiscoverableSkills ||
    hasRequestedSpaces;

  return (
    <div className="flex flex-col gap-4">
      {showDescription && skill.userFacingDescription ? (
        <div className="relative text-sm text-foreground">
          {editedSections.has("description") && <EditedSectionBar />}
          {skill.userFacingDescription}
        </div>
      ) : null}

      {/* The API redacts the private fields of the skills an admin cannot read and flags it with
          `canRead: false`; only admins ever get such a skill. */}
      {!skill.canRead && <RedactedSkillMessage skill={skill} owner={owner} />}

      {showSeparator ? <Separator /> : null}

      {hasInstructions && skill.agentFacingDescription && (
        <div className="relative flex flex-col gap-4">
          {editedSections.has("when_to_use") && <EditedSectionBar />}
          <div className="heading-lg text-foreground">
            <Trans>When to use this skill</Trans>
          </div>
          <SkillDescriptionReadOnlyEditor
            content={skill.agentFacingDescription}
          />
        </div>
      )}

      {hasInstructions && (
        <div className="dd-privacy-mask flex flex-col gap-4">
          <DetailsSectionHeading
            label={t`Instructions`}
            isEdited={editedSections.has("guidelines")}
          />
          {/* Remounts the instructions editor on preview change, since it only reads its content once. */}
          <SkillInstructionsReadOnlyEditor
            key={previewSuggestions.map((s) => s.sId).join(",")}
            content={skill.instructions ?? ""}
            htmlContent={skill.instructionsHtml ?? ""}
            owner={owner}
            onKnowledgeItemsChange={handleKnowledgeItemsChange}
            className="max-h-150 overflow-y-auto"
          />
        </div>
      )}
      {knowledgeItems.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="heading-lg text-foreground">
            <Trans>Knowledge</Trans>
          </div>
          <div className="flex flex-wrap gap-2">
            {knowledgeItems.filter(isFullKnowledgeItem).map((item) => (
              <KnowledgeChip
                key={item.nodeId}
                node={item.node}
                title={item.label}
                color="primary"
              />
            ))}
          </div>
        </div>
      )}
      {hasFiles && (
        <div className="relative flex flex-col gap-4">
          {editedSections.has("files") && <EditedSectionBar />}
          <div className="heading-lg text-foreground">
            <Trans>Files</Trans>
          </div>
          <div className="flex flex-wrap gap-2">
            {skill.fileAttachments.map((file) => (
              <AttachmentChip
                key={file.fileId}
                label={file.fileName}
                icon={{ visual: File02 }}
                color="primary"
                size="xs"
              />
            ))}
            {addedFilePaths.map((filePath) => (
              <AttachmentChip
                key={filePath}
                label={filePath.split("/").pop() ?? filePath}
                icon={{ visual: File02 }}
                color="primary"
                size="xs"
              />
            ))}
          </div>
        </div>
      )}
      {showChildSkills && (
        <div className="flex flex-col gap-4">
          <div className="heading-lg text-foreground">
            <Trans>Skills</Trans>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {childSkills.map((childSkill) => {
              const SkillAvatar = getSkillAvatarIcon(childSkill);

              return (
                <Tooltip
                  key={childSkill.sId}
                  label={childSkill.userFacingDescription || childSkill.name}
                  trigger={
                    <div className="flex min-w-0 flex-row items-center gap-2">
                      <SkillAvatar size="xs" />
                      <div className="min-w-0 truncate">{childSkill.name}</div>
                    </div>
                  }
                  tooltipTriggerAsChild
                />
              );
            })}
          </div>
        </div>
      )}
      {sortedMCPServerViews.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="heading-lg text-foreground">
            <Trans>Tools</Trans>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {sortedMCPServerViews.map((view) => (
              <Tooltip
                key={view.title}
                label={view.description ?? view.title}
                trigger={
                  <div className="flex flex-row items-center gap-2">
                    {view.avatar}
                    <div className="truncate">{view.title}</div>
                  </div>
                }
                tooltipTriggerAsChild
              />
            ))}
          </div>
        </div>
      )}

      {showDiscoverableSkills && (
        <DiscoverableSkillsList key={owner.sId} owner={owner} />
      )}

      {/* A redacted skill (admin, see `canRead`) requests spaces the caller is not a member of. */}
      <RequestedSpacesSection
        owner={owner}
        requestedSpaceIds={skill.requestedSpaceIds}
        spaces={spaces}
        resolveAsAdmin={!skill.canRead}
      />
    </div>
  );
}

const renderMCPServerView = (view: MCPServerViewType) => ({
  title: getMcpServerViewDisplayName(view),
  description: getMcpServerViewDescription(view),
  avatar: getAvatar(view.server, "xs"),
});
