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

interface SkillLoadErrorProps {
  onRetry?: () => void;
}

export function SkillLoadError({ onRetry }: SkillLoadErrorProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <ContentMessage
        title="Unable to load skill"
        variant="warning"
        icon={InfoCircle}
        size="lg"
        action={
          onRetry ? (
            <ContentMessageAction
              icon={RefreshCw02}
              label="Retry"
              variant="warning"
              onClick={onRetry}
            />
          ) : undefined
        }
      >
        The skill could not be loaded. Please try again.
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
            <Chip
              size="mini"
              color={availabilityDisplay.color}
              label={availabilityDisplay.label}
              className="absolute -bottom-3 shadow-sm"
            />
          )}
        </div>
      </div>

      {/* Title and edit info */}
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-xl font-semibold text-foreground">{skill.name}</h2>

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
