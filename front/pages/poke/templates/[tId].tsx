import {
  AssistantPreview,
  ColorPicker,
  DropdownMenu,
  EmojiPicker,
  Markdown,
  TextArea,
} from "@dust-tt/sparkle";
import type {
  CreateTemplateFormType,
  TemplateTagCodeType,
} from "@dust-tt/types";
import {
  ASSISTANT_CREATIVITY_LEVELS,
  CreateTemplateFormSchema,
  generateTailwindBackgroundColors,
  GPT_4_TURBO_MODEL_CONFIG,
  MULTI_ACTION_PRESETS,
  removeNulls,
  TEMPLATE_VISIBILITIES,
  TEMPLATES_TAGS_CONFIG,
} from "@dust-tt/types";
import { ioTsResolver } from "@hookform/resolvers/io-ts";
import _ from "lodash";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Control } from "react-hook-form";
import { useFieldArray, useForm } from "react-hook-form";
import { MultiSelect } from "react-multi-select-component";

import { makeUrlForEmojiAndBackgroud } from "@app/components/assistant_builder/avatar_picker/utils";
import PokeNavbar from "@app/components/poke/PokeNavbar";
import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import {
  PokeDialog,
  PokeDialogContent,
  PokeDialogHeader,
  PokeDialogTitle,
  PokeDialogTrigger,
} from "@app/components/poke/shadcn/ui/dialog";
import {
  PokeForm,
  PokeFormControl,
  PokeFormField,
  PokeFormItem,
  PokeFormLabel,
  PokeFormMessage,
} from "@app/components/poke/shadcn/ui/form";
import { PokeInput } from "@app/components/poke/shadcn/ui/input";
import {
  PokeSelect,
  PokeSelectContent,
  PokeSelectItem,
  PokeSelectTrigger,
  PokeSelectValue,
} from "@app/components/poke/shadcn/ui/select";
import { USED_MODEL_CONFIGS } from "@app/components/providers/types";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { usePokeAssistantTemplate } from "@app/poke/swr";

export const getServerSideProps = withSuperUserAuthRequirements<{
  templateId: string;
}>(async (context) => {
  const { tId: templateId } = context.query;
  if (!templateId || typeof templateId !== "string") {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      templateId,
    },
  };
});

function InputField({
  control,
  name,
  title,
  placeholder,
  type = "text",
}: {
  control: Control<CreateTemplateFormType>;
  name: keyof CreateTemplateFormType;
  title?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <PokeFormField
      control={control}
      name={name}
      render={({ field }) => (
        <PokeFormItem>
          <PokeFormLabel className="capitalize">{title ?? name}</PokeFormLabel>
          {typeof field.value === "string" ? (
            <PokeFormControl>
              <PokeInput
                placeholder={placeholder ?? name}
                type={type}
                {...field}
                value={field.value} // Ensuring value is a string
              />
            </PokeFormControl>
          ) : (
            <div>
              <p className="text-red-500">
                Invalid input type: {typeof field.value}. Expected a string.
              </p>
            </div>
          )}
          <PokeFormMessage />
        </PokeFormItem>
      )}
    />
  );
}

type Picker = (handleSelect: (value: string) => void) => React.ReactNode;

function PickerInputField({
  buttonLabel,
  control,
  name,
  picker,
  placeholder,
  title,
}: {
  buttonLabel?: string;
  control: Control<CreateTemplateFormType>;
  name: keyof CreateTemplateFormType;
  picker: Picker;
  placeholder?: string;
  title?: string;
}) {
  const pickerRef = useRef<HTMLDivElement>(null);

  return (
    <PokeFormField
      control={control}
      name={name}
      render={({ field }) => (
        <PokeFormItem>
          <PokeFormLabel className="capitalize">{title ?? name}</PokeFormLabel>
          {typeof field.value === "string" ? (
            <PokeFormControl>
              <div className="flex flex-row gap-2">
                <PokeInput
                  readOnly
                  placeholder={placeholder ?? name}
                  {...field}
                  value={field.value} // Ensuring value is a string
                />
                <DropdownMenu>
                  <DropdownMenu.Button>
                    <div ref={pickerRef}>
                      <PokeButton variant="outline">{buttonLabel}</PokeButton>
                    </div>
                  </DropdownMenu.Button>
                  <DropdownMenu.Items
                    width={350}
                    origin="topLeft"
                    variant="no-padding"
                  >
                    {picker((value: string) => {
                      field.onChange(value);
                      pickerRef.current?.click();
                    })}
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>
            </PokeFormControl>
          ) : (
            <div>
              <p className="text-red-500">
                Invalid input type: {typeof field.value}. Expected a string.
              </p>
            </div>
          )}
          <PokeFormMessage />
        </PokeFormItem>
      )}
    />
  );
}

function TextareaField({
  control,
  name,
  title,
  placeholder,
  previewMardown = false,
  rows = 30,
}: {
  control: Control<CreateTemplateFormType>;
  name: keyof CreateTemplateFormType;
  title?: string;
  placeholder?: string;
  previewMardown?: boolean;
  rows?: number;
}) {
  return (
    <PokeFormField
      control={control}
      name={name}
      render={({ field }) => (
        <PokeFormItem>
          <PokeFormLabel className="capitalize">{title ?? name}</PokeFormLabel>
          {typeof field.value === "string" ? (
            previewMardown && field.value.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <PokeFormControl>
                    <TextArea
                      placeholder={placeholder ?? name}
                      rows={rows}
                      {...field} // Ensure `value` is a string
                      value={field.value} // Explicitly setting value as a string
                    />
                  </PokeFormControl>
                </div>
                <div className="rounded-xl border p-2">
                  <Markdown content={field.value} />
                </div>
              </div>
            ) : (
              <PokeFormControl>
                <TextArea
                  placeholder={placeholder ?? name}
                  rows={rows}
                  {...field} // Ensure `value` is a string
                  value={field.value} // Explicitly setting value as a string
                />
              </PokeFormControl>
            )
          ) : (
            <div>
              <p className="text-red-500">
                Invalid input type: {typeof field.value}. Expected a string.
              </p>
            </div>
          )}
          <PokeFormMessage />
        </PokeFormItem>
      )}
    />
  );
}

function PresetActionsField({
  control,
  name,
  title,
}: {
  control: Control<CreateTemplateFormType>;
  name: keyof CreateTemplateFormType;
  title?: string;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "presetActions",
  });

  return (
    <PokeFormField
      control={control}
      name={name}
      render={() => {
        return (
          <PokeFormItem>
            <PokeFormLabel className="capitalize">
              {title ?? name}
            </PokeFormLabel>
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-5 gap-4">
                <InputField
                  control={control}
                  // @ts-expect-error - TS doesn't like the dynamic key
                  name={`presetActions.${index}.name`}
                  title="Tool Name"
                  placeholder="Tool Name"
                />
                <SelectField
                  control={control}
                  // @ts-expect-error - TS doesn't like the dynamic key
                  name={`presetActions.${index}.type`}
                  title="Tool Type"
                  options={Object.entries(MULTI_ACTION_PRESETS).map(
                    ([value, display]) => ({
                      value,
                      display,
                    })
                  )}
                />
                <TextareaField
                  control={control}
                  // @ts-expect-error - TS doesn't like the dynamic key
                  name={`presetActions.${index}.description`}
                  title="Tool Description"
                  placeholder="Description of the action"
                  rows={5}
                />
                <TextareaField
                  control={control}
                  // @ts-expect-error - TS doesn't like the dynamic key
                  name={`presetActions.${index}.help`}
                  title="Tool Help content"
                  placeholder="This is the text displayed on the template's sidebar just on top of the button to add the tool."
                  rows={5}
                />
                <PokeFormItem>
                  <PokeFormLabel className="capitalize">Remove</PokeFormLabel>
                  <div>
                    <PokeButton
                      variant="secondary"
                      onClick={(e) => {
                        e.preventDefault();
                        remove(index);
                      }}
                    >
                      Remove Tool
                    </PokeButton>
                  </div>
                </PokeFormItem>
              </div>
            ))}
            <br />
            <PokeButton
              variant="secondary"
              onClick={(e) => {
                e.preventDefault();
                const pendingAction = {
                  name: "",
                  type: "",
                  description: "",
                  help: "",
                };
                // @ts-expect-error - TS killed me today
                append(pendingAction);
              }}
            >
              Add Tool
            </PokeButton>
            <PokeFormMessage />
          </PokeFormItem>
        );
      }}
    />
  );
}

const tagOptions: {
  label: string;
  value: TemplateTagCodeType;
}[] = _.map(TEMPLATES_TAGS_CONFIG, (config, key) => ({
  label: config.label,
  value: key as TemplateTagCodeType,
}));

interface SelectFieldOption {
  value: string;
  display?: string;
}

function SelectField({
  control,
  name,
  title,
  options,
}: {
  control: Control<CreateTemplateFormType>;
  name: keyof CreateTemplateFormType;
  title?: string;
  options: SelectFieldOption[];
}) {
  return (
    <PokeFormField
      control={control}
      name={name}
      render={({ field }) => (
        <PokeFormItem>
          <PokeFormLabel className="capitalize">{title ?? name}</PokeFormLabel>
          <PokeFormControl>
            <PokeSelect
              value={field.value as string}
              onValueChange={field.onChange}
            >
              <PokeFormControl>
                <PokeSelectTrigger>
                  <PokeSelectValue placeholder={title ?? name} />
                </PokeSelectTrigger>
              </PokeFormControl>
              <PokeSelectContent>
                <div className="bg-slate-100">
                  {options.map((option) => (
                    <PokeSelectItem key={option.value} value={option.value}>
                      {option.display ?? option.value}
                    </PokeSelectItem>
                  ))}
                </div>
              </PokeSelectContent>
            </PokeSelect>
          </PokeFormControl>
          <PokeFormMessage />
        </PokeFormItem>
      )}
    />
  );
}

function PreviewDialog({ form }: { form: any }) {
  const [open, setOpen] = useState(false);

  const emoji = form.getValues("emoji");
  const backgroundColor = form.getValues("backgroundColor");
  const [id, unified] = emoji ? emoji.split("/") : [];

  const avatarVisual = makeUrlForEmojiAndBackgroud(
    {
      id,
      unified,
      native: "",
    },
    backgroundColor
  );

  return (
    <PokeDialog open={open} onOpenChange={setOpen}>
      <PokeDialogTrigger asChild>
        <PokeButton variant="secondary">✨ Preview Template Card</PokeButton>
      </PokeDialogTrigger>
      <PokeDialogContent className="bg-structure-50 sm:max-w-[600px]">
        <PokeDialogHeader>
          <PokeDialogTitle>Preview</PokeDialogTitle>
        </PokeDialogHeader>
        <AssistantPreview
          title={form.getValues("handle")}
          pictureUrl={avatarVisual}
          description={form.getValues("description") ?? ""}
          variant="list"
          onClick={() => console.log("clicked")}
        />
      </PokeDialogContent>
    </PokeDialog>
  );
}

function TemplatesPage({
  templateId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const sendNotification = React.useContext(SendNotificationsContext);

  const { assistantTemplate } = usePokeAssistantTemplate({
    templateId: templateId === "new" ? null : templateId,
  });

  const onSubmit = useCallback(
    (values: CreateTemplateFormType) => {
      const cleanedValues = Object.fromEntries(
        removeNulls(
          Object.entries(values).map(([key, value]) => {
            if (typeof value !== "string") {
              return [key, value];
            }
            const cleanedValue = value.trim();
            if (!cleanedValue) {
              return null;
            }
            return [key, cleanedValue];
          })
        )
      );

      void submit();

      async function submit() {
        setIsSubmitting(true);
        try {
          const method = assistantTemplate ? "PATCH" : "POST";
          const url = assistantTemplate
            ? `/api/poke/templates/${assistantTemplate.sId}`
            : "/api/poke/templates";
          const r = await fetch(url, {
            method,
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(cleanedValues),
          });

          if (!r.ok) {
            throw new Error(
              `Something went wrong: ${r.status} ${await r.text()}`
            );
          }
          sendNotification({
            title: `Template ${assistantTemplate ? "updated" : "created"}`,
            type: "success",
            description: `Template ${
              assistantTemplate ? "updated" : "created"
            } successfully.`,
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          router.back();
        } catch (e) {
          setIsSubmitting(false);
          sendNotification({
            title: "Error creating template",
            type: "error",
            description: `${e}`,
          });
        }
      }
    },
    [assistantTemplate, sendNotification, setIsSubmitting, router]
  );

  const { submit: onDelete } = useSubmitFunction(async () => {
    if (assistantTemplate === null) {
      window.alert(
        "An error occurred while attempting to delete the template (can't find the template)."
      );
      return;
    }

    if (
      !window.confirm(
        "Are you sure you want to delete this template? There's no going back."
      )
    ) {
      return;
    }
    try {
      const r = await fetch(`/api/poke/templates/${assistantTemplate.sId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!r.ok) {
        throw new Error("Failed to delete template.");
      }
      await router.push("/poke/templates");
    } catch (e) {
      console.error(e);
      window.alert(
        "An error occurred while attempting to delete the template."
      );
    }
  });

  const form = useForm<CreateTemplateFormType>({
    resolver: ioTsResolver(CreateTemplateFormSchema),
    defaultValues: {
      description: "",
      handle: "",
      presetInstructions: "",
      presetModelId: GPT_4_TURBO_MODEL_CONFIG.modelId,
      presetTemperature: "balanced",
      helpInstructions: "",
      helpActions: "",
      emoji: "black_cat/1f408-200d-2b1b", // 🐈‍⬛.
      backgroundColor: "bg-pink-300",
      tags: [],
      visibility: "draft",
    },
  });

  useEffect(() => {
    if (assistantTemplate) {
      // Override default values of the form with existing template.
      Object.entries(assistantTemplate).forEach(([key, value]) => {
        form.setValue(key as unknown as any, value ?? "");
      });
    }
  }, [assistantTemplate, form]);

  if (isSubmitting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-structure-50">
        <div className="text-structure-900">Creating/Updating template...</div>
      </div>
    );
  }

  if (Object.keys(form.formState.errors).length > 0) {
    // Useful to debug in case you have an error on a field that is not rendered
    console.log("Form errors", form.formState.errors);
  }

  return (
    <div className="min-h-screen bg-structure-50 pb-48">
      <PokeNavbar />
      <div className="mx-auto h-full max-w-7xl flex-grow flex-col items-center justify-center pt-8">
        <PokeForm {...form}>
          <form className="space-y-8">
            <div className="grid grid-cols-3 gap-4">
              <InputField
                control={form.control}
                name="handle"
                placeholder="myAssistant"
              />
              <SelectField
                control={form.control}
                name="visibility"
                title="Visibility"
                options={TEMPLATE_VISIBILITIES.map((v) => ({
                  value: v,
                  display: v,
                }))}
              />
              <PokeFormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <PokeFormItem>
                    <PokeFormLabel>Tags</PokeFormLabel>
                    <PokeFormControl>
                      <MultiSelect
                        options={tagOptions}
                        value={field.value.map((tag: TemplateTagCodeType) => ({
                          label: TEMPLATES_TAGS_CONFIG[tag].label,
                          value: tag,
                        }))}
                        onChange={(
                          tags: { label: string; value: string }[]
                        ) => {
                          field.onChange(tags.map((tag) => tag.value));
                        }}
                        labelledBy="Select"
                        hasSelectAll={false}
                      />
                    </PokeFormControl>
                    <PokeFormMessage />
                  </PokeFormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <SelectField
                control={form.control}
                name="presetModelId"
                title="Preset Model"
                options={USED_MODEL_CONFIGS.map((config) => ({
                  value: config.modelId,
                  display: config.displayName,
                }))}
              />
              <SelectField
                control={form.control}
                name="presetTemperature"
                title="Preset Temperature"
                options={ASSISTANT_CREATIVITY_LEVELS.map((acl) => ({
                  value: acl,
                }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <PickerInputField
                control={form.control}
                name="emoji"
                picker={(handleSelect) => (
                  <EmojiPicker
                    theme="light"
                    previewPosition="none"
                    onEmojiSelect={(emoji) =>
                      handleSelect(`${emoji.id}/${emoji.unified}`)
                    }
                  />
                )}
                buttonLabel="🙂"
              />
              <PickerInputField
                control={form.control}
                name="backgroundColor"
                title="Background Color"
                picker={(handleSelect) => (
                  <ColorPicker
                    colors={generateTailwindBackgroundColors()}
                    onColorSelect={(color) => {
                      handleSelect(color);
                    }}
                  />
                )}
                buttonLabel="🎨"
              />
              <div className="flex h-full flex-col justify-end">
                <PreviewDialog form={form} />
              </div>
            </div>
            <TextareaField
              control={form.control}
              name="presetInstructions"
              title="preset Instructions"
              placeholder="Instructions"
            />
            <TextareaField
              control={form.control}
              name="description"
              placeholder="A short description"
              previewMardown={true}
            />
            <TextareaField
              control={form.control}
              name="helpInstructions"
              title="Help Instructions"
              placeholder="Instructions help bubble..."
              previewMardown={true}
            />
            <TextareaField
              control={form.control}
              name="helpActions"
              title="Help Tools"
              placeholder="Tools help bubble..."
              previewMardown={true}
            />
            <PresetActionsField
              control={form.control}
              name="presetActions"
              title="Preset Tools"
            />
            <div className="space flex gap-2">
              <PokeButton
                onClick={form.handleSubmit(onSubmit)}
                className="border border-structure-300"
              >
                Save
              </PokeButton>
              <PokeButton
                type="button"
                variant="destructive"
                onClick={onDelete}
              >
                Delete this template
              </PokeButton>
            </div>
          </form>
        </PokeForm>
      </div>
    </div>
  );
}

export default TemplatesPage;
