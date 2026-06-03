import { ExtendedSkillBadge } from "@app/components/skills/ExtendedSkillBadge";
import { RestoreSkillDialog } from "@app/components/skills/RestoreSkillDialog";
import { SkillDetailsButtonBar } from "@app/components/skills/SkillDetailsButtonBar";
import { SkillEditorsTab } from "@app/components/skills/SkillEditorsTab";
import { SkillInfoTab } from "@app/components/skills/SkillInfoTab";
import { getSkillAvatarIcon, hasRelations } from "@app/lib/skill";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type {
  SkillRelations,
  SkillType,
  SkillWithoutInstructionsAndToolsWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  InfoCircleV2,
  RefreshCw02V2,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Users01V2,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useState } from "react";

type SkillDetailsProps = {
  skill: SkillWithoutInstructionsAndToolsWithRelationsType | null;
  onClose: () => void;
  owner: WorkspaceType;
  user: UserType;
};

export function SkillDetailsSheet({
  skill,
  onClose,
  user,
  owner,
}: SkillDetailsProps) {
  // Fetch the full skill (with instructions/tools) for the content section,
  // since the list endpoint may not include them.
  const { skill: fullSkill, isSkillLoading } = useSkill({
    workspaceId: owner.sId,
    skillId: skill?.sId ?? null,
    disabled: !skill,
  });

  return (
    <Sheet open={skill !== null} onOpenChange={onClose}>
      <SheetContent size="lg" className="pb-4">
        <VisuallyHidden>
          <SheetTitle />
        </VisuallyHidden>
        {skill && (
          <>
            <SheetHeader>
              <DescriptionSection
                skill={skill}
                owner={owner}
                onClose={onClose}
              />
            </SheetHeader>
            <SheetContainer className="pb-4">
              {isSkillLoading || !fullSkill ? (
                <div className="flex justify-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : (
                <SkillDetailsSheetContent
                  skill={{ ...fullSkill, relations: skill.relations }}
                  user={user}
                  owner={owner}
                />
              )}
            </SheetContainer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

type SkillDetailsSheetContentProps = {
  skill: SkillType & { relations?: SkillRelations };
  owner: WorkspaceType;
  user: UserType;
};

export function SkillDetailsSheetContent({
  skill,
  owner,
  user,
}: SkillDetailsSheetContentProps) {
  const [selectedTab, setSelectedTab] = useState<"info" | "editors">("info");

  const showEditorsTabs = skill.status !== "suggested" && skill.canWrite;

  if (showEditorsTabs) {
    return (
      <Tabs value={selectedTab}>
        <TabsList border={false}>
          <TabsTrigger
            value="info"
            label="Info"
            icon={InfoCircleV2}
            onClick={() => setSelectedTab("info")}
          />
          <TabsTrigger
            value="editors"
            label="Editors"
            icon={Users01V2}
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

type DescriptionSectionProps = {
  skill: SkillWithoutInstructionsAndToolsWithRelationsType;
  owner: WorkspaceType;
  onClose: () => void;
};

const DescriptionSection = ({
  skill,
  owner,
  onClose,
}: DescriptionSectionProps) => {
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const { editedByUser } = skill.relations;
  const editedDate =
    skill.updatedAt &&
    new Date(skill.updatedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const SkillAvatar = getSkillAvatarIcon(skill.icon);

  return (
    <div className="flex flex-col items-center gap-4 pt-4">
      <div className="relative flex items-center justify-center">
        {/* eslint-disable-next-line react-hooks/static-components */}
        <SkillAvatar name="Skill avatar" size="xl" />
      </div>

      {/* Title and edit info */}
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-xl font-semibold text-foreground dark:text-foreground-night">
          {skill.name}
        </h2>
        {skill.relations.extendedSkill && (
          <ExtendedSkillBadge extendedSkill={skill.relations.extendedSkill} />
        )}

        {editedDate && (
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Last edited: {editedDate}
            {editedByUser && ` by ${editedByUser.fullName}`}
          </p>
        )}
      </div>

      {skill.status === "active" && (
        <SkillDetailsButtonBar owner={owner} skill={skill} onClose={onClose} />
      )}

      {skill.status === "archived" && (
        <>
          <ContentMessage
            title="This skill has been archived."
            variant="warning"
            icon={InfoCircleV2}
            size="sm"
          >
            It is no longer active and cannot be used.
            {skill.canWrite && (
              <div className="mt-2">
                <Button
                  variant="outline"
                  label="Restore"
                  onClick={() => {
                    setShowRestoreModal(true);
                  }}
                  icon={RefreshCw02V2}
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
};
