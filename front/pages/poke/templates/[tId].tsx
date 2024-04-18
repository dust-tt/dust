import type {
  CreateTemplateFormType,
  TemplateTagCodeType,
} from "@dust-tt/types";
import {
  ACTION_PRESETS,
  ASSISTANT_CREATIVITY_LEVELS,
  CreateTemplateFormSchema,
  GPT_4_TURBO_MODEL_CONFIG,
  removeNulls,
  TEMPLATES_TAGS_CONFIG,
} from "@dust-tt/types";
import { ioTsResolver } from "@hookform/resolvers/io-ts";
import _ from "lodash";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React, { useCallback, useEffect } from "react";
import type { Control } from "react-hook-form";
import { useForm } from "react-hook-form";
import { MultiSelect } from "react-multi-select-component";

import { USED_MODEL_CONFIGS } from "@app/components/assistant_builder/InstructionScreen";
import PokeNavbar from "@app/components/poke/PokeNavbar";
import { PokeButton } from "@app/components/poke/shadcn/ui/button";
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
import { PokeTextarea } from "@app/components/poke/shadcn/ui/textarea";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
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
}: {
  control: Control<CreateTemplateFormType>;
  name: keyof CreateTemplateFormType;
  title?: string;
  placeholder?: string;
}) {
  return (
    <PokeFormField
      control={control}
      name={name}
      render={({ field }) => (
        <PokeFormItem>
          <PokeFormLabel className="capitalize">{title ?? name}</PokeFormLabel>
          <PokeFormControl>
            <PokeInput placeholder={placeholder ?? name} {...field} />
          </PokeFormControl>
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
}: {
  control: Control<CreateTemplateFormType>;
  name: keyof CreateTemplateFormType;
  title?: string;
  placeholder?: string;
}) {
  return (
    <PokeFormField
      control={control}
      name={name}
      render={({ field }) => (
        <PokeFormItem>
          <PokeFormLabel className="capitalize">{title ?? name}</PokeFormLabel>
          <PokeFormControl>
            <PokeTextarea placeholder={placeholder ?? name} {...field} />
          </PokeFormControl>
          <PokeFormMessage />
        </PokeFormItem>
      )}
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
                      {option.display ? option.display : option.value}
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

function TemplatesPage({
  templateId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
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

  const form = useForm<CreateTemplateFormType>({
    resolver: ioTsResolver(CreateTemplateFormSchema),
    defaultValues: {
      description: "",
      handle: "",
      presetInstructions: "",
      presetModelId: GPT_4_TURBO_MODEL_CONFIG.modelId,
      presetTemperature: "balanced",
      presetAction: "reply",
      helpInstructions: "",
      helpActions: "",
      tags: [],
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
        <div className="text-structure-900">Creating template...</div>
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
      <div className="mx-auto h-full max-w-2xl flex-grow flex-col items-center justify-center pt-8">
        <PokeForm {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <InputField
              control={form.control}
              name="handle"
              placeholder="myAssistant"
            />
            <TextareaField
              control={form.control}
              name="description"
              placeholder="A short description"
            />
            <TextareaField
              control={form.control}
              name="presetInstructions"
              placeholder="Instructions"
            />
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
            <SelectField
              control={form.control}
              name="presetAction"
              title="Preset Action"
              options={Object.entries(ACTION_PRESETS).map(([k, v]) => ({
                value: k,
                display: v,
              }))}
            />
            <TextareaField
              control={form.control}
              name="helpInstructions"
              title="Help Instructions"
              placeholder="Instructions help bubble..."
            />
            <TextareaField
              control={form.control}
              name="helpActions"
              title="Help Actions"
              placeholder="Actions help bubble..."
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
                      onChange={(tags: { label: string; value: string }[]) => {
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
            <InputField control={form.control} name="emoji" placeholder="🤓" />
            <InputField
              control={form.control}
              name="backgroundColor"
              placeholder="tailwind color code"
            />
            <PokeButton type="submit" className="border border-structure-300">
              Submit
            </PokeButton>
          </form>
        </PokeForm>
      </div>
    </div>
  );
}

export default TemplatesPage;
