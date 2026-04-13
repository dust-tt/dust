import { SkillBuilderAgentFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderAgentFacingDescriptionSection";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import { SkillBuilderFilesSection } from "@app/components/skill_builder/SkillBuilderFilesSection";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  SkillBuilderFormContext,
  skillBuilderFormSchema,
} from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderInstructionsSection } from "@app/components/skill_builder/SkillBuilderInstructionsSection";
import { SkillBuilderRequestedSpacesSection } from "@app/components/skill_builder/SkillBuilderRequestedSpacesSection";
import { SkillBuilderSettingsSection } from "@app/components/skill_builder/SkillBuilderSettingsSection";
import { SkillBuilderSuggestionsPanel } from "@app/components/skill_builder/SkillBuilderSuggestionsPanel";
import { SkillBuilderToolsSection } from "@app/components/skill_builder/SkillBuilderToolsSection";
import { SkillVersionHistoryPicker } from "@app/components/skill_builder/SkillBuilderVersionComparisonBanner";
import { SkillBuilderVersionComparisonFooter } from "@app/components/skill_builder/SkillBuilderVersionComparisonFooter";
import {
  SkillVersionComparisonProvider,
  useSkillVersionComparisonContext,
} from "@app/components/skill_builder/SkillBuilderVersionContext";
import {
  getDefaultSkillFormData,
  transformSkillTypeToFormData,
} from "@app/components/skill_builder/skillFormData";
import { submitSkillBuilderForm } from "@app/components/skill_builder/submitSkillBuilderForm";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useNavigationLock } from "@app/hooks/useNavigationLock";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSkillSuggestions } from "@app/hooks/useSkillSuggestions";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { getSkillIcon } from "@app/lib/skill";
import { useSkillHistory } from "@app/lib/swr/skill_configurations";
import { useSkillEditors } from "@app/lib/swr/skill_editors";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { getConversationRoute } from "@app/lib/utils/router";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import {
  BarFooter,
  BarHeader,
  Button,
  ContentMessage,
  cn,
  InformationCircleIcon,
  LightbulbIcon,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

interface SkillBuilderProps {
  skill?: SkillType;
  extendedSkill?: SkillType;
  onSaved: () => void;
}

export default function SkillBuilder({
  skill,
  extendedSkill,
  onSaved,
}: SkillBuilderProps) {
  const { owner, user } = useSkillBuilderContext();
  const { hasFeature } = useFeatureFlags();
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);
  const isMobile = useIsMobile();

  const { editors } = useSkillEditors({
    owner,
    skillId: skill?.sId ?? null,
  });

  const { skillHistory } = useSkillHistory({
    owner,
    skill,
    disabled: !skill,
    limit: 30,
  });

  const { suggestions } = useSkillSuggestions({
    skillId: skill?.sId ?? null,
    states: ["pending"],
    workspaceId: owner.sId,
    disabled: !skill,
  });

  const hasPendingSuggestions = suggestions.length > 0;

  const defaultValues = useMemo(() => {
    if (skill) {
      return transformSkillTypeToFormData(skill);
    }

    return getDefaultSkillFormData({
      user,
      extendedSkillId: extendedSkill?.sId ?? null,
    });
  }, [skill, user, extendedSkill]);

  const form = useForm<SkillBuilderFormData>({
    resolver: zodResolver(skillBuilderFormSchema),
    defaultValues,
    resetOptions: {
      keepDirtyValues: true,
      keepErrors: true,
    },
  });

  // Populate editors reactively
  useEffect(() => {
    const currentValues = form.getValues();

    form.reset({
      ...currentValues,
      editors: skill || editors.length > 0 ? editors : [user],
    });
  }, [editors, form, user, skill]);

  const isCreatingNew = !skill;
  const { isDirty } = form.formState;

  useNavigationLock(isDirty && !isSaving);

  const handleSubmit = async (data: SkillBuilderFormData) => {
    setIsSaving(true);

    const result = await submitSkillBuilderForm({
      formData: data,
      owner,
      skillId: skill?.sId,
      currentEditors: editors,
    });

    if (result.isErr()) {
      sendNotification({
        title: isCreatingNew ? "Error creating skill" : "Error updating skill",
        description: result.error.message,
        type: "error",
      });
      setIsSaving(false);
      return;
    }

    sendNotification({
      title: isCreatingNew ? "Skill created" : "Skill updated",
      description: isCreatingNew
        ? "Your skill has been successfully created."
        : "Your skill has been successfully updated.",
      type: "success",
    });

    onSaved();

    if (isCreatingNew && result.value.sId) {
      const newUrl = `/w/${owner.sId}/builder/skills/${result.value.sId}`;
      await router.replace(newUrl, undefined, { shallow: true });
    } else {
      form.reset(form.getValues(), { keepValues: true });
    }

    setIsSaving(false);
  };

  const handleCancel = () => {
    if (window.history.state?.idx > 0) {
      router.back();
    } else {
      void router.replace(getConversationRoute(owner.sId));
    }
  };

  const handleSave = () => {
    void form.handleSubmit(handleSubmit)();
  };

  const [isSuggestionsPanelOpen, setIsSuggestionsPanelOpen] = useState(false);

  useEffect(() => {
    if (hasPendingSuggestions) {
      setIsSuggestionsPanelOpen(true);
    }
  }, [hasPendingSuggestions]);

  const showSuggestionsPanel = skill && !isMobile;

  const leftPanel = (
    <div className="flex h-full w-full flex-col">
      <BarHeader
        variant="default"
        className="mx-4"
        title={skill ? `Edit skill ${skill.name}` : "Create new skill"}
        centerActions={
          skill && skillHistory ? (
            <SkillVersionHistoryPicker
              skill={skill}
              skillHistory={skillHistory}
            />
          ) : undefined
        }
        rightActions={
          <div className="flex items-center gap-2">
            {showSuggestionsPanel && (
              <Button
                icon={LightbulbIcon}
                size="sm"
                variant={
                  isSuggestionsPanelOpen ? "highlight" : "ghost-secondary"
                }
                tooltip={
                  isSuggestionsPanelOpen
                    ? "Hide suggestions"
                    : "Show suggestions"
                }
                onClick={() => setIsSuggestionsPanelOpen((prev) => !prev)}
              />
            )}
            <BarHeader.ButtonBar variant="close" onClose={handleCancel} />
          </div>
        }
      />

      <ScrollArea className="flex-1">
        <div className="mx-auto space-y-10 p-8 2xl:max-w-5xl">
          {extendedSkill && (
            <ContentMessage
              title={`Built on ${extendedSkill.name}`}
              variant="highlight"
              icon={getSkillIcon(extendedSkill.icon)}
              size="lg"
            >
              A customized version of {extendedSkill.name} with your own
              guidelines and tools.
            </ContentMessage>
          )}
          {skill?.status === "suggested" && (
            <ContentMessage
              title="This is a generated skill suggestion"
              variant="primary"
              icon={InformationCircleIcon}
              size="lg"
            >
              This skill was automatically generated based on your workspace's
              configuration. We recommend reviewing and editing it to match your
              specific needs before saving.
            </ContentMessage>
          )}
          <SkillBuilderRequestedSpacesSection />
          <SkillBuilderAgentFacingDescriptionSection />
          <SkillBuilderInstructionsSection />
          {hasFeature("sandbox_tools") && <SkillBuilderFilesSection />}
          <SkillBuilderToolsSection extendedSkill={extendedSkill} />
          <SkillBuilderSettingsOrComparisonFooter />
        </div>
      </ScrollArea>
      <BarFooter
        variant="default"
        className="mx-4 justify-between"
        leftActions={
          <Button
            variant="outline"
            label="Cancel"
            onClick={handleCancel}
            type="button"
          />
        }
        rightActions={
          <Button
            variant="highlight"
            label={isSaving ? "Saving..." : "Save"}
            onClick={handleSave}
            disabled={isSaving}
          />
        }
      />
    </div>
  );

  return (
    <SkillBuilderFormContext.Provider value={form}>
      <FormProvider form={form} asForm={false}>
        <SkillVersionComparisonProvider>
          <div
            className={cn(
              "flex h-dvh flex-row",
              "bg-background text-foreground",
              "dark:bg-background-night dark:text-foreground-night"
            )}
          >
            {showSuggestionsPanel ? (
              <ResizablePanelGroup
                id="skill-builder-layout"
                direction="horizontal"
                className="h-full w-full"
              >
                <ResizablePanel defaultSize={65} minSize={40}>
                  <div className="h-full w-full overflow-y-auto">
                    {leftPanel}
                  </div>
                </ResizablePanel>

                {isSuggestionsPanelOpen && (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel
                      defaultSize={35}
                      minSize={20}
                      maxSize={50}
                    >
                      <div className="h-full w-full overflow-y-auto">
                        <SkillBuilderSuggestionsPanel />
                      </div>
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            ) : (
              leftPanel
            )}
          </div>
        </SkillVersionComparisonProvider>
      </FormProvider>
    </SkillBuilderFormContext.Provider>
  );
}

function SkillBuilderSettingsOrComparisonFooter() {
  const { compareVersion } = useSkillVersionComparisonContext();

  if (compareVersion) {
    return <SkillBuilderVersionComparisonFooter />;
  }

  return <SkillBuilderSettingsSection />;
}
