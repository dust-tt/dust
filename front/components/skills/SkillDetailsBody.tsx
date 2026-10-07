import { EditedDot } from "@app/components/assistant/details/DetailsSectionHeading";
import { useEditedSkillSections } from "@app/components/assistant/details/SuggestionPreviewContext";
import { RestoreSkillDialog } from "@app/components/skills/RestoreSkillDialog";
import { SKILL_AVAILABILITY_DISPLAY } from "@app/components/skills/skillAvailabilityDisplay";
import { SkillDetailsButtonBar } from "@app/components/skills/SkillDetailsButtonBar";
import { SkillEditorsTab } from "@app/components/skills/SkillEditorsTab";
import { SkillInfoTab } from "@app/components/skills/SkillInfoTab";
import { formatDate } from "@app/lib/i18n/format";
import {
  getSkillAvatarIcon,
  hasRelations,
  isDustProvidedSkill,
} from "@app/lib/skill";
import type { GetSkillsWithRelationsResponseBody } from "@app/types/api/skills";
import type {
  SkillRelations,
  SkillType,
} from "@app/types/assistant/skill_configuration";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  ContentMessage,
  ContentMessageAction,
  InfoCircle,
  RefreshCw02,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Users01,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

// Skill details rendering shared by the surfaces that display a skill: the
// `SkillDetailsSheet` and the conversation skill side panel.

// Why a skill could not be shown.
export type SkillLoadErrorReason = "not_found" | "editors_only" | "unavailable";

const SKILL_LOAD_ERRORS: Record<
  SkillLoadErrorReason,
  { title: MessageDescriptor; body: MessageDescriptor; canRetry: boolean }
> = {
  not_found: {
    title: msg`Skill not found`,
    body: msg`This skill may have been deleted, or the link may be incorrect.`,
    canRetry: false,
  },
  editors_only: {
    title: msg`Skill not available`,
    body: msg`This skill is currently visible only to its editors. An editor can publish it or share it with you.`,
    canRetry: false,
  },
  unavailable: {
    title: msg`Unable to load skill`,
    body: msg`The skill could not be loaded. Please try again.`,
    canRetry: true,
  },
};

interface SkillLoadErrorProps {
  reason?: SkillLoadErrorReason;
  onRetry?: () => void;
}

export function SkillLoadError({
  reason = "unavailable",
  onRetry,
}: SkillLoadErrorProps) {
  const { t } = useLingui();
  const { title, body, canRetry } = SKILL_LOAD_ERRORS[reason];
  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <ContentMessage
        title={t(title)}
        variant="warning"
        icon={InfoCircle}
        size="lg"
        action={
          onRetry && canRetry ? (
            <ContentMessageAction
              icon={RefreshCw02}
              label={t`Retry`}
              variant="warning"
              onClick={onRetry}
            />
          ) : undefined
        }
      >
        {t(body)}
      </ContentMessage>
    </div>
  );
}

interface SkillDetailsContentProps {
  skill: SkillType & { relations?: SkillRelations };
  owner: WorkspaceType;
  user: UserType;
}

export function SkillDetailsContent({
  skill,
  owner,
  user,
}: SkillDetailsContentProps) {
  const { t } = useLingui();
  const [selectedTab, setSelectedTab] = useState<"info" | "editors">("info");
  const editedSections = useEditedSkillSections();

  // The editors tab is shown to everyone (non-editors get a read-only list,
  // SkillEditorsTab hides the remove column for them), except for global
  // skills which have no editor group.
  const showEditorsTabs =
    skill.status !== "suggested" && !isDustProvidedSkill(skill);

  if (showEditorsTabs) {
    return (
      <Tabs value={selectedTab}>
        <TabsList border={false}>
          <TabsTrigger
            value="info"
            label={t`Info`}
            icon={InfoCircle}
            onClick={() => setSelectedTab("info")}
          />
          <TabsTrigger
            value="editors"
            label={t`Editors`}
            icon={Users01}
            iconRight={
              editedSections.has("editors") ? <EditedDot /> : undefined
            }
            onClick={() => setSelectedTab("editors")}
          />
        </TabsList>
        <div className="mt-4">
          <TabsContent value="info">
            <SkillInfoTab skill={skill} owner={owner} />
          </TabsContent>
          <TabsContent value="editors">
            {hasRelations(skill) && (
              <SkillEditorsTab skill={skill} owner={owner} user={user} />
            )}
          </TabsContent>
        </div>
      </Tabs>
    );
  }

  return <SkillInfoTab skill={skill} owner={owner} />;
}

interface SkillDetailsHeaderProps {
  skill: GetSkillsWithRelationsResponseBody["skills"][number];
  owner: WorkspaceType;
  onClose: () => void;
  replaceOnEdit?: boolean;
  onFavoriteChange?: (
    skill: GetSkillsWithRelationsResponseBody["skills"][number],
    isFavorite: boolean
  ) => Promise<void>;
}

export function SkillDetailsHeader({
  skill,
  owner,
  onClose,
  replaceOnEdit,
  onFavoriteChange,
}: SkillDetailsHeaderProps) {
  const { t } = useLingui();
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const editedSections = useEditedSkillSections();
  const { editedByUser } = skill.relations;
  const editedDate =
    skill.updatedAt &&
    formatDate(new Date(skill.updatedAt), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const SkillAvatar = getSkillAvatarIcon(skill);
  const availabilityDisplay = SKILL_AVAILABILITY_DISPLAY[skill.availability];
  const editorName = editedByUser?.fullName;

  return (
    <div className="flex flex-col items-center gap-4 pt-4">
      <div className="relative flex items-center justify-center">
        <div className="relative flex flex-col items-center gap-2">
          <SkillAvatar name={t`Skill avatar`} size="xl" />
          {skill.status === "active" && (
            <div className="absolute -bottom-3 flex items-center gap-1">
              <Chip
                size="mini"
                color={availabilityDisplay.color}
                label={t(availabilityDisplay.label)}
                className="shadow-sm"
              />
              {editedSections.has("availability") && <EditedDot />}
            </div>
          )}
        </div>
      </div>

      {/* Title and edit info */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-foreground">
            {skill.name}
          </h2>
          {editedSections.has("name") && <EditedDot />}
        </div>

        {editedDate && (
          <p className="text-sm text-muted-foreground">
            {editorName ? (
              <Trans>
                Last edited: {editedDate} by {editorName}
              </Trans>
            ) : (
              <Trans>Last edited: {editedDate}</Trans>
            )}
          </p>
        )}
      </div>

      {skill.status === "active" && (
        <SkillDetailsButtonBar
          owner={owner}
          skill={skill}
          onClose={onClose}
          replaceOnEdit={replaceOnEdit}
          onFavoriteChange={onFavoriteChange}
        />
      )}

      {skill.status === "archived" && (
        <>
          <ContentMessage
            title={t`This skill has been archived.`}
            variant="warning"
            icon={InfoCircle}
            size="sm"
          >
            <Trans>It is no longer active and cannot be used.</Trans>
            {skill.canAdministrate && (
              <div className="mt-2">
                <Button
                  variant="outline"
                  label={t`Restore`}
                  onClick={() => {
                    setShowRestoreModal(true);
                  }}
                  icon={RefreshCw02}
                />
              </div>
            )}
          </ContentMessage>

          <RestoreSkillDialog
            owner={owner}
            isOpen={showRestoreModal}
            skill={skill}
            onClose={() => {
              setShowRestoreModal(false);
              onClose();
            }}
          />
        </>
      )}
    </div>
  );
}
