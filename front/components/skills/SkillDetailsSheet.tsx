import {
  ArrowPathIcon,
  Button,
  ContentMessage,
  InformationCircleIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useState } from "react";

import { ResourceAvatar } from "@app/components/resources/resources_icons";
import { RestoreSkillDialog } from "@app/components/skills/RestoreSkillDialog";
import { SkillDetailsButtonBar } from "@app/components/skills/SkillDetailsButtonBar";
import { SkillEditorsTab } from "@app/components/skills/SkillEditorsTab";
import { SkillInfoTab } from "@app/components/skills/SkillInfoTab";
import { getSkillIcon, hasRelations } from "@app/lib/skill";
import type { UserType, WorkspaceType } from "@app/types";
import type {
  SkillRelations,
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";

type SkillDetailsProps = {
  skill: SkillWithRelationsType | null;
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
  return (
    <Sheet open={skill !== null} onOpenChange={onClose}>
      <SheetContent size="lg">
        <VisuallyHidden>
          <SheetTitle />
        </VisuallyHidden>
        {skill && (
          <>
            <SheetHeader className="flex flex-col gap-5 text-sm text-foreground dark:text-foreground-night">
              <DescriptionSection
                skill={skill}
                owner={owner}
                onClose={onClose}
              />
            </SheetHeader>
            <SheetContainer className="pb-4">
              <SkillDetailsSheetContent
                skill={skill}
                user={user}
                owner={owner}
              />
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

  const showEditorsTabs = skill.canWrite;

  if (showEditorsTabs) {
    return (
      <Tabs value={selectedTab}>
        <TabsList border={false}>
          <TabsTrigger
            value="info"
            label="Info"
            icon={InformationCircleIcon}
            onClick={() => setSelectedTab("info")}
          />
          <TabsTrigger
            value="editors"
            label="Editors"
            icon={UserGroupIcon}
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
  skill: SkillWithRelationsType;
  owner: WorkspaceType;
  onClose: () => void;
};

const DescriptionSection = ({
  skill,
  owner,
  onClose,
}: DescriptionSectionProps) => {
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const author = skill.relations.author;
  const editedDate =
    skill.updatedAt &&
    new Date(skill.updatedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  return (
    <div className="flex flex-col items-center gap-4 pt-4">
      <div className="relative flex items-center justify-center">
        <ResourceAvatar
          icon={getSkillIcon(skill.icon)}
          name="Skill avatar"
          size="xl"
        />
      </div>

      {/* Title and edit info */}
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-xl font-semibold text-foreground dark:text-foreground-night">
          {skill.name}
        </h2>
        {skill.relations.extendedSkill && (
          <p className="text-base text-muted-foreground dark:text-muted-foreground-night">
            Extends {skill.relations.extendedSkill.name}
          </p>
        )}

        {editedDate && (
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Last edited: {editedDate}
            {author && ` by ${author.fullName}`}
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
            icon={InformationCircleIcon}
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
                  icon={ArrowPathIcon}
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
