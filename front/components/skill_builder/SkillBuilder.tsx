import {
  BarFooter,
  BarHeader,
  Button,
  cn,
  ScrollArea,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { SkillBuilderAgentFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderAgentFacingDescriptionSection";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  SkillBuilderFormContext,
  skillBuilderFormSchema,
} from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderInstructionsSection } from "@app/components/skill_builder/SkillBuilderInstructionsSection";
import { SkillBuilderRequestedSpacesSection } from "@app/components/skill_builder/SkillBuilderRequestedSpacesSection";
import { SkillBuilderSettingsSection } from "@app/components/skill_builder/SkillBuilderSettingsSection";
import { SkillBuilderToolsSection } from "@app/components/skill_builder/SkillBuilderToolsSection";
import { submitSkillBuilderForm } from "@app/components/skill_builder/submitSkillBuilderForm";
import {
  getDefaultSkillFormData,
  transformSkillConfigurationToFormData,
} from "@app/components/skill_builder/transformSkillConfiguration";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useNavigationLock } from "@app/hooks/useNavigationLock";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSkillConfigurationTools } from "@app/lib/swr/actions";
import { useSkillEditors } from "@app/lib/swr/skill_editors";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

interface SkillBuilderProps {
  skillConfiguration?: SkillConfigurationType;
}

export default function SkillBuilder({
  skillConfiguration,
}: SkillBuilderProps) {
  const { owner, user } = useSkillBuilderContext();
  const router = useRouter();
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);

  const { actions, isActionsLoading } = useSkillConfigurationTools(
    owner,
    skillConfiguration?.sId ?? null
  );

  const { editors } = useSkillEditors({
    owner,
    skillConfigurationId: skillConfiguration?.sId ?? null,
  });

  const defaultValues = useMemo(() => {
    if (skillConfiguration) {
      return transformSkillConfigurationToFormData(skillConfiguration);
    }

    return getDefaultSkillFormData({ user });
  }, [skillConfiguration, user]);

  const form = useForm<SkillBuilderFormData>({
    resolver: zodResolver(skillBuilderFormSchema),
    defaultValues,
    resetOptions: {
      keepDirtyValues: true,
      keepErrors: true,
    },
  });

  // Populate editors and tools reactively
  useEffect(() => {
    const currentValues = form.getValues();

    form.reset({
      ...currentValues,
      tools: actions,
      editors: skillConfiguration || editors.length > 0 ? editors : [user],
    });
  }, [isActionsLoading, actions, editors, form, user, skillConfiguration]);

  const isCreatingNew = !skillConfiguration;
  const { isDirty } = form.formState;

  useNavigationLock(isDirty && !isSaving);

  const handleSubmit = async (data: SkillBuilderFormData) => {
    setIsSaving(true);

    const result = await submitSkillBuilderForm({
      formData: data,
      owner,
      skillConfigurationId: !isCreatingNew
        ? skillConfiguration?.sId
        : undefined,
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

    if (isCreatingNew && result.value.sId) {
      const newUrl = `/w/${owner.sId}/builder/skills/${result.value.sId}`;
      await router.replace(newUrl, undefined, { shallow: true });
    } else {
      form.reset(form.getValues(), { keepValues: true });
    }

    setIsSaving(false);
  };

  const handleCancel = async () => {
    await appLayoutBack(owner, router);
  };

  const handleSave = () => {
    void form.handleSubmit(handleSubmit)();
  };

  return (
    <SkillBuilderFormContext.Provider value={form}>
      <FormProvider form={form} asForm={false}>
        <div
          className={cn(
            "h-dvh flex flex-row",
            "bg-background text-foreground",
            "dark:bg-background-night dark:text-foreground-night"
          )}
        >
          <div className="flex h-full w-full flex-col">
            <BarHeader
              variant="default"
              className="mx-4"
              title={
                skillConfiguration
                  ? `Edit skill ${skillConfiguration.name}`
                  : "Create new skill"
              }
              rightActions={
                <Button
                  icon={XMarkIcon}
                  onClick={handleCancel}
                  variant="ghost"
                  type="button"
                />
              }
            />

            <ScrollArea className="flex-1">
              <div className="mx-auto space-y-10 p-4 2xl:max-w-5xl">
                <div>
                  <h2 className="heading-lg text-foreground dark:text-foreground-night">
                    Create new skill
                  </h2>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    Create a custom capability for specific tasks
                  </p>
                </div>
                <SkillBuilderRequestedSpacesSection />
                <SkillBuilderAgentFacingDescriptionSection />
                <SkillBuilderInstructionsSection />
                <SkillBuilderToolsSection />
                <SkillBuilderSettingsSection />
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
        </div>
      </FormProvider>
    </SkillBuilderFormContext.Provider>
  );
}
