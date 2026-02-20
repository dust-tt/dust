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
import {
  getDefaultSkillFormData,
  transformSkillTypeToFormData,
} from "@app/components/skill_builder/skillFormData";
import { submitSkillBuilderForm } from "@app/components/skill_builder/submitSkillBuilderForm";
import { ExtendedSkillBadge } from "@app/components/skills/ExtendedSkillBadge";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useNavigationLock } from "@app/hooks/useNavigationLock";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import { useSkillEditors } from "@app/lib/swr/skill_editors";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import {
  BarFooter,
  BarHeader,
  Button,
  ContentMessage,
  cn,
  InformationCircleIcon,
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
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);

  const { editors } = useSkillEditors({
    owner,
    skillId: skill?.sId ?? null,
  });

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

  return (
    <SkillBuilderFormContext.Provider value={form}>
      <FormProvider form={form} asForm={false}>
        <div
          className={cn(
            "flex h-dvh flex-row",
            "bg-background text-foreground",
            "dark:bg-background-night dark:text-foreground-night"
          )}
        >
          <div className="flex h-full w-full flex-col">
            <BarHeader
              variant="default"
              className="mx-4"
              title={skill ? `Edit skill ${skill.name}` : "Create new skill"}
              description={
                extendedSkill ? (
                  <ExtendedSkillBadge
                    extendedSkill={extendedSkill}
                    className="text-sm"
                  />
                ) : undefined
              }
              rightActions={
                <BarHeader.ButtonBar variant="close" onClose={handleCancel} />
              }
            />

            <ScrollArea className="flex-1">
              <div className="mx-auto space-y-10 p-8 2xl:max-w-5xl">
                {skill?.status === "suggested" && (
                  <ContentMessage
                    title="This is a generated skill suggestion"
                    variant="primary"
                    icon={InformationCircleIcon}
                    size="lg"
                  >
                    This skill was automatically generated based on your
                    workspace's configuration. We recommend reviewing and
                    editing it to match your specific needs before saving.
                  </ContentMessage>
                )}
                <SkillBuilderRequestedSpacesSection />
                <SkillBuilderAgentFacingDescriptionSection />
                <SkillBuilderInstructionsSection skill={skill} />
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
