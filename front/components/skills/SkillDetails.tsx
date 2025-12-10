import {
  Avatar,
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

import { SkillInfoTab } from "@app/components/skills/SkillInfoTab";
import { SKILL_ICON } from "@app/lib/skill";
import type { SkillConfigurationWithAuthorType } from "@app/types/assistant/skill_configuration";

type SkillDetailsProps = {
  skillConfiguration: SkillConfigurationWithAuthorType;
  onClose: () => void;
};

export function SkillDetails({
  skillConfiguration,
  onClose,
}: SkillDetailsProps) {
  const [selectedTab, setSelectedTab] = useState<"info" | "editors">("info");

  // TODO(skills 2025-12-10): Check based on GLOBAL_SKILLS_SID enum
  const isGlobalSkill = false;
  const showEditorsTabs = !isGlobalSkill;

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
          <DescriptionSection skillConfiguration={skillConfiguration} />
        </SheetHeader>
        <SheetContainer className="pb-4">
          {showEditorsTabs ? (
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
                  {/* TODO(skills 2025-12-10): Editors list */}
                  <></>
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            <SkillInfoTab skillConfiguration={skillConfiguration} />
          )}
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}

type DescriptionSectionProps = {
  skillConfiguration: SkillConfigurationWithAuthorType;
};

const DescriptionSection = ({
  skillConfiguration,
}: DescriptionSectionProps) => (
  <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-3 sm:flex-row">
      <Avatar name="Agent avatar" visual={<SKILL_ICON />} size="lg" />
      <div className="flex grow flex-col gap-1">
        <div className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">
          {skillConfiguration.name}
        </div>
      </div>
    </div>
  </div>
);
