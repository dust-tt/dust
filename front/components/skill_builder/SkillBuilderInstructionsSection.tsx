import type { SlashCommand } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { buildSkillBuilderSlashCommandItems } from "@app/components/editor/extensions/skill_builder/SlashCommandExtension";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  type SkillBuilderCapability,
  SkillBuilderInstructionsEditor,
} from "@app/components/skill_builder/SkillBuilderInstructionsEditor";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useSkills } from "@app/lib/swr/skill_configurations";
import {
  ArrowGoBackIcon,
  BookOpenIcon,
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InformationCircleIcon,
  ToolsIcon,
} from "@dust-tt/sparkle";
import { Fragment, useState } from "react";
import { useFormContext } from "react-hook-form";

const LARGE_INSTRUCTIONS_CHARACTER_THRESHOLD = 40_000;

const INSTRUCTIONS_FIELD_NAME = "instructions";
const INSTRUCTIONS_HTML_FIELD_NAME = "instructionsHtml";

interface SkillBuilderCapabilitiesDropdownProps {
  disabled: boolean;
  emptyMessage: string;
  isOpen: boolean;
  items: SlashCommand[];
  onItemSelect: (item: SlashCommand) => void;
  onOpenChange: (isOpen: boolean) => void;
}

function SkillBuilderCapabilitiesDropdown({
  disabled,
  emptyMessage,
  isOpen,
  items,
  onItemSelect,
  onOpenChange,
}: SkillBuilderCapabilitiesDropdownProps) {
  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="primary"
          label="Attach capabilities"
          icon={ToolsIcon}
          disabled={disabled}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end">
        {items.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
            {emptyMessage}
          </div>
        ) : (
          items.map((item, index) => {
            const sectionLabel =
              item.sectionLabel &&
              items[index - 1]?.sectionLabel !== item.sectionLabel
                ? item.sectionLabel
                : undefined;
            const menuItem = (
              <DropdownMenuItem
                icon={item.icon}
                itemId={item.id}
                label={item.label}
                description={item.description}
                truncateText
                onClick={() => onItemSelect(item)}
              />
            );

            return (
              <Fragment key={item.id}>
                {sectionLabel ? (
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground dark:text-muted-foreground-night">
                    {sectionLabel}
                  </div>
                ) : null}
                {menuItem}
              </Fragment>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SkillBuilderInstructionsSection() {
  const { setValue, watch } = useFormContext<SkillBuilderFormData>();
  const { owner, skillId } = useSkillBuilderContext();
  const { compareVersion, exitDiffMode } = useSkillVersionComparisonContext();
  const { hasFeature } = useFeatureFlags();
  const [addKnowledge, setAddKnowledge] = useState<(() => void) | null>(null);
  const [addCapability, setAddCapability] = useState<
    ((capability: SkillBuilderCapability) => void) | null
  >(null);
  const [isCapabilitiesDropdownOpen, setIsCapabilitiesDropdownOpen] =
    useState(false);

  const enableSkillReferences = hasFeature("nested_skills");
  const { skills, isSkillsError, isSkillsLoading } = useSkills({
    disabled:
      !!compareVersion || !isCapabilitiesDropdownOpen || !enableSkillReferences,
    owner,
    status: "active",
  });

  const currentInstructions = watch(INSTRUCTIONS_FIELD_NAME);
  const instructionsDiffer =
    compareVersion && compareVersion.instructions !== currentInstructions;
  const capabilityItems = buildSkillBuilderSlashCommandItems({
    baseItems: [],
    currentSkillId: skillId,
    includeSkillSuggestions: enableSkillReferences,
    query: "",
    skills,
  });

  const handleCapabilitySelect = (item: SlashCommand) => {
    const skill = item.data?.skill;
    if (!skill || !addCapability) {
      return;
    }

    addCapability({
      skillIcon: skill.icon,
      skillId: skill.id,
      skillName: skill.name,
    });
    setIsCapabilitiesDropdownOpen(false);
  };

  const capabilitiesDropdownEmptyMessage = isSkillsLoading
    ? "Loading capabilities…"
    : isSkillsError
      ? "Unable to load capabilities"
      : "No capabilities found";

  const restoreInstructions = () => {
    if (!compareVersion) {
      return;
    }

    setValue(INSTRUCTIONS_FIELD_NAME, compareVersion.instructions ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(
      INSTRUCTIONS_HTML_FIELD_NAME,
      compareVersion.instructionsHtml ?? "",
      { shouldDirty: true }
    );
    exitDiffMode();
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col items-end justify-between gap-2 sm:flex-row">
        <h3 className="heading-lg font-semibold text-foreground dark:text-foreground-night">
          What guidelines should it provide?
        </h3>
        <div className="flex items-center gap-2">
          {instructionsDiffer && (
            <Button
              variant="outline"
              size="sm"
              icon={ArrowGoBackIcon}
              onClick={restoreInstructions}
              label="Restore instructions"
            />
          )}
          {!compareVersion && (
            <Button
              variant={enableSkillReferences ? "outline" : "primary"}
              label="Attach knowledge"
              icon={BookOpenIcon}
              onClick={addKnowledge ?? undefined}
              disabled={!addKnowledge}
            />
          )}
          {!compareVersion && enableSkillReferences && (
            <SkillBuilderCapabilitiesDropdown
              disabled={!addCapability}
              emptyMessage={capabilitiesDropdownEmptyMessage}
              isOpen={isCapabilitiesDropdownOpen}
              items={capabilityItems}
              onItemSelect={handleCapabilitySelect}
              onOpenChange={setIsCapabilitiesDropdownOpen}
            />
          )}
        </div>
      </div>
      {(currentInstructions?.length ?? 0) >
        LARGE_INSTRUCTIONS_CHARACTER_THRESHOLD && (
        <ContentMessage
          variant="info"
          icon={InformationCircleIcon}
          size="lg"
          title="This skill is noticeably large"
        >
          Large skills consume a significant part of the context window on each
          use. Consider keeping your guidelines concise.
        </ContentMessage>
      )}
      <SkillBuilderInstructionsEditor
        onAddCapability={(fn) => setAddCapability(() => fn)}
        onAddKnowledge={(fn) => setAddKnowledge(() => fn)}
      />
    </section>
  );
}
