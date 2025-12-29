import {
  ArrowPathIcon,
  Button,
  ContentMessage,
  InformationCircleIcon,
  RobotIcon,
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
  skill: SkillWithRelationsType;
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
    <Sheet
      open={!!skill}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="lg">
        <VisuallyHidden>
          <SheetTitle />
        </VisuallyHidden>
        <SheetHeader className="flex flex-col gap-5 text-sm text-foreground dark:text-foreground-night">
          <DescriptionSection skill={skill} owner={owner} onClose={onClose} />
        </SheetHeader>
        <SheetContainer className="pb-4">
          <SkillDetailsSheetContent skill={skill} user={user} owner={owner} />
        </SheetContainer>
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
  const [selectedTab, setSelectedTab] = useState<"info" | "editors" | "agents">(
    "info"
  );

  const agents = skill.relations?.usage?.agents ?? [];

  // For suggested skills: show Info + Agents tabs
  if (skill.status === "suggested") {
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
            value="agents"
            label="Agents"
            icon={RobotIcon}
            onClick={() => setSelectedTab("agents")}
          />
        </TabsList>
        <div className="mt-4">
          <TabsContent value="info">
            <SkillInfoTab skill={skill} />
          </TabsContent>
          <TabsContent value="agents">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                The prompt of these agents may be simplified by using this
                skill.
              </p>
              {agents.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {agents.map((agent) => (
                    <div
                      key={agent.sId}
                      className="text-sm text-foreground dark:text-foreground-night"
                    >
                      {agent.name}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  No agents found.
                </p>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    );
  }

  // For active/archived skills: show Info + Editors tabs if canWrite
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
            <SkillInfoTab skill={skill} />
          </TabsContent>
          <TabsContent value="editors">
            {hasRelations(skill) && (
              <SkillEditorsTab
                skillConfiguration={skill}
                owner={owner}
                user={user}
              />
            )}
          </TabsContent>
        </div>
      </Tabs>
    );
  }

  return <SkillInfoTab skill={skill} />;
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

  const suggestedDate =
    skill.createdAt &&
    new Date(skill.createdAt).toLocaleDateString("en-US", {
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

      <div className="flex flex-col items-center gap-1">
        <h2 className="text-xl font-semibold text-foreground dark:text-foreground-night">
          {skill.name}
        </h2>
        {skill.relations.extendedSkill && (
          <p className="text-base text-muted-foreground dark:text-muted-foreground-night">
            Extends {skill.relations.extendedSkill.name}
          </p>
        )}

        {skill.status === "suggested" && suggestedDate && (
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Suggested on: {suggestedDate}
          </p>
        )}

        {skill.status !== "suggested" && editedDate && (
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
