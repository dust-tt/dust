import { zodResolver } from "@hookform/resolvers/zod";
import {
  BarFooter,
  BarHeader,
  Button,
  cn,
  Input,
  ScrollArea,
  TextArea,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

import { useSendNotification } from "@app/hooks/useNotification";
import type { UserType, WorkspaceType } from "@app/types";

const skillBuilderFormSchema = z.object({
  name: z
    .string()
    .min(1, "Skill name is required")
    .refine((value) => !/\s/.test(value), "Skill name cannot contain spaces"),
  description: z.string().min(1, "Skill description is required"),
  instructions: z.string().min(1, "Skill instructions are required"),
});

type SkillBuilderFormData = z.infer<typeof skillBuilderFormSchema>;

interface SkillBuilderProps {
  owner: WorkspaceType;
  user: UserType;
}

export default function SkillBuilder({ owner }: SkillBuilderProps) {
  const router = useRouter();
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<SkillBuilderFormData>({
    resolver: zodResolver(skillBuilderFormSchema),
    defaultValues: {
      name: "",
      description: "",
      instructions: "",
    },
  });

  const { field: nameField, fieldState: nameFieldState } =
    useController<SkillBuilderFormData>({
      name: "name",
      control: form.control,
    });

  const { field: descriptionField, fieldState: descriptionFieldState } =
    useController<SkillBuilderFormData>({
      name: "description",
      control: form.control,
    });

  const { field: instructionsField, fieldState: instructionsFieldState } =
    useController<SkillBuilderFormData>({
      name: "instructions",
      control: form.control,
    });

  const handleSubmit = async (data: SkillBuilderFormData) => {
    setIsSaving(true);

    const response = await fetch(
      `/api/w/${owner.sId}/assistant/skill_configurations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          instructions: data.instructions,
          scope: "private",
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      sendNotification({
        title: "Error creating skill",
        description:
          errorData.error?.message ?? "An unexpected error occurred.",
        type: "error",
      });
      setIsSaving(false);
      return;
    }

    sendNotification({
      title: "Skill created",
      description: "Your skill has been successfully created.",
      type: "success",
    });

    await router.push(`/w/${owner.sId}/builder/assistants`);
  };

  const handleCancel = async () => {
    await router.back();
  };

  const handleSave = () => {
    void form.handleSubmit(handleSubmit)();
  };

  return (
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
          title="Create new skill"
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
          <div className="mx-auto max-w-3xl space-y-10 p-8">
            {/* Description Section */}
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="heading-lg text-foreground dark:text-foreground-night">
                  Description
                </h2>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  A short summary of what this skill does.
                </p>
              </div>
              <Input
                placeholder="Enter skill description"
                {...descriptionField}
              />
              {descriptionFieldState.error && (
                <p className="text-sm text-warning-500">
                  {descriptionFieldState.error.message}
                </p>
              )}
            </section>

            {/* Instructions Section */}
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="heading-lg text-foreground dark:text-foreground-night">
                  Skill instructions
                </h2>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Command or guideline you provide to your agent to direct its
                  responses.
                </p>
              </div>
              <TextArea
                placeholder="What does this agent do? How should it behave? What should it avoid doing?"
                className="min-h-60"
                {...instructionsField}
              />
              {instructionsFieldState.error && (
                <p className="text-sm text-warning-500">
                  {instructionsFieldState.error.message}
                </p>
              )}
            </section>

            {/* Name Section */}
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="heading-lg text-foreground dark:text-foreground-night">
                  Name
                </h2>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  A unique name for your skill (no spaces).
                </p>
              </div>
              <Input placeholder="Enter skill name" {...nameField} />
              {nameFieldState.error && (
                <p className="text-sm text-warning-500">
                  {nameFieldState.error.message}
                </p>
              )}
            </section>
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
  );
}
