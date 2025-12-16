import {
  ArrowPathIcon,
  Avatar,
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

import { RestoreSkillDialog } from "@app/components/skills/RestoreSkillDialog";
import { SkillEditorsTab } from "@app/components/skills/SkillEditorsTab";
import { SkillInfoTab } from "@app/components/skills/SkillInfoTab";
import { SKILL_ICON } from "@app/lib/skill";
import type { UserType, WorkspaceType } from "@app/types";
import type {
  SkillConfigurationRelations,
  SkillType,
} from "@app/types/assistant/skill_configuration";

type SkillDetailsProps = {
  skillConfiguration: SkillType & SkillConfigurationRelations;
  onClose: () => void;
  owner: WorkspaceType;
  user: UserType;
};

export function SkillDetailsSheet({
  skillConfiguration,
  onClose,
  user,
  owner,
}: SkillDetailsProps) {
  return (
    <Sheet
      open={!!skillConfiguration}
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
          <DescriptionSection
            skillConfiguration={skillConfiguration}
            owner={owner}
            onClose={onClose}
          />
        </SheetHeader>
        <SheetContainer className="pb-4">
          <SkillDetailsSheetContent
            skillConfiguration={skillConfiguration}
            user={user}
            owner={owner}
          />
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}

type SkillDetailsSheetContentProps = {
  skillConfiguration: SkillType & SkillConfigurationRelations;
  owner: WorkspaceType;
  user: UserType;
};

export function SkillDetailsSheetContent({
  skillConfiguration,
  owner,
  user,
}: SkillDetailsSheetContentProps) {
  const [selectedTab, setSelectedTab] = useState<"info" | "editors">("info");

  const showEditorsTabs = skillConfiguration.canWrite;

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
            <SkillInfoTab skillConfiguration={skillConfiguration} />
          </TabsContent>
          <TabsContent value="editors">
            <SkillEditorsTab
              skillConfiguration={skillConfiguration}
              owner={owner}
              user={user}
            />
          </TabsContent>
        </div>
      </Tabs>
    );
  }

  return <SkillInfoTab skillConfiguration={skillConfiguration} />;
}

type DescriptionSectionProps = {
  skillConfiguration: SkillType;
  owner: WorkspaceType;
  onClose: () => void;
};

const DescriptionSection = ({
  skillConfiguration,
  owner,
  onClose,
}: DescriptionSectionProps) => {
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Avatar name="Skill avatar" visual={<SKILL_ICON />} size="lg" />
        <div className="flex grow flex-col gap-1">
          <div className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">
            {skillConfiguration.name}
          </div>
        </div>
      </div>

      {skillConfiguration.status === "archived" && (
        <>
          <ContentMessage
            title="This skill has been archived."
            variant="warning"
            icon={InformationCircleIcon}
            size="sm"
          >
            It is no longer active and cannot be used.
            {skillConfiguration.canWrite && (
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
            skillConfiguration={skillConfiguration}
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
