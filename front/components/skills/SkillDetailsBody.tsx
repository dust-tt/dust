import { EditedDot } from "@app/components/assistant/details/DetailsSectionHeading";
import { useEditedSkillSections } from "@app/components/assistant/details/SuggestionPreviewContext";
import { RestoreSkillDialog } from "@app/components/skills/RestoreSkillDialog";
import { SkillDetailsButtonBar } from "@app/components/skills/SkillDetailsButtonBar";
import { SkillEditorsTab } from "@app/components/skills/SkillEditorsTab";
import { SkillInfoTab } from "@app/components/skills/SkillInfoTab";
import {
  getSkillAvatarIcon,
  hasRelations,
  isDustProvidedSkill,
} from "@app/lib/skill";
import { SKILL_AVAILABILITY_DISPLAY } from "@app/lib/skills/labels";
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
import { useState } from "react";

// Skill details rendering shared by the surfaces that display a skill: the
// `SkillDetailsSheet` and the conversation skill side panel.

// Why a skill could not be shown.
export type SkillLoadErrorReason = "not_found" | "editors_only" | "unavailable";

const SKILL_LOAD_ERRORS: Record<
  SkillLoadErrorReason,
  { title: string; body: string; canRetry: boolean }
> = {
  not_found: {
    title: "Skill not found",
    body: "This skill may have been deleted, or the link may be incorrect.",
    canRetry: false,
  },
  editors_only: {
    title: "Skill not available",
    body: "This skill is currently visible only to its editors. An editor can publish it or share it with you.",
    canRetry: false,
  },
  unavailable: {
    title: "Unable to load skill",
    body: "The skill could not be loaded. Please try again.",
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
  const { title, body, canRetry } = SKILL_LOAD_ERRORS[reason];
  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <ContentMessage
        title={title}
        variant="warning"
        icon={InfoCircle}
        size="lg"
        action={
          onRetry && canRetry ? (
            <ContentMessageAction
              icon={RefreshCw02}
              label="Retry"
              variant="warning"
              onClick={onRetry}
            />
          ) : undefined
        }
      >
        {body}
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
            label="Info"
            icon={InfoCircle}
            onClick={() => setSelectedTab("info")}
          />
          <TabsTrigger
            value="editors"
            label="Editors"
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
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const editedSections = useEditedSkillSections();
  const { editedByUser } = skill.relations;
  const editedDate =
    skill.updatedAt &&
    new Date(skill.updatedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const SkillAvatar = getSkillAvatarIcon(skill);
  const availabilityDisplay = SKILL_AVAILABILITY_DISPLAY[skill.availability];

  return (
    <div className="flex flex-col items-center gap-4 pt-4">
      <div className="relative flex items-center justify-center">
        <div className="relative flex flex-col items-center gap-2">
          {/* eslint-disable-next-line react-hooks/static-components */}
          <SkillAvatar name="Skill avatar" size="xl" />
          {skill.status === "active" && (
            <div className="absolute -bottom-3 flex items-center gap-1">
              <Chip
                size="mini"
                color={availabilityDisplay.color}
                label={availabilityDisplay.label}
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
            Last edited: {editedDate}
            {editedByUser && ` by ${editedByUser.fullName}`}
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
            title="This skill has been archived."
            variant="warning"
            icon={InfoCircle}
            size="sm"
          >
            It is no longer active and cannot be used.
            {skill.canAdministrate && (
              <div className="mt-2">
                <Button
                  variant="outline"
                  label="Restore"
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
