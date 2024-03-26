import {
  ActionPresetSchema,
  assistantTemplateTagNames,
  GPT_4_TURBO_MODEL_CONFIG,
  TemperaturePresetSchema,
} from "@dust-tt/types";
import { ioTsResolver } from "@hookform/resolvers/io-ts";
import * as t from "io-ts";
import { nonEmptyArray } from "io-ts-types/lib/nonEmptyArray";
import { NonEmptyString } from "io-ts-types/lib/NonEmptyString";
import type { InferGetServerSidePropsType } from "next";
import React from "react";
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
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async (context, auth) => {
    if (!auth.isDustSuperUser()) {
      return {
        notFound: true,
      };
    }

    return {
      props: {},
    };
  }
);

const formSchema = t.type({
  name: NonEmptyString,
  description: t.union([t.string, t.undefined]),
  presetHandle: t.union([t.string, t.undefined]),
  presetInstructions: t.union([t.string, t.undefined]),
  presetModel: t.string,
  presetTemperature: TemperaturePresetSchema,
  presetAction: ActionPresetSchema,
  helpInstructions: t.union([t.string, t.undefined]),
  helpActions: t.union([t.string, t.undefined]),
  tags: nonEmptyArray(t.string),
});

type FormSchema = t.TypeOf<typeof formSchema>;

function InputField({
  control,
  name,
  title,
  placeholder,
}: {
  control: Control<FormSchema>;
  name: keyof FormSchema;
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
  control: Control<FormSchema>;
  name: keyof FormSchema;
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

const tagOptions = assistantTemplateTagNames.map((t) => ({
  label: t,
  value: t,
}));

function SelectField({
  control,
  name,
  title,
  options,
}: {
  control: Control<FormSchema>;
  name: keyof FormSchema;
  title?: string;
  options: string[];
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
              onValueChange={field.onChange}
              defaultValue={field.value as string}
            >
              <PokeFormControl>
                <PokeSelectTrigger>
                  <PokeSelectValue placeholder={title ?? name} />
                </PokeSelectTrigger>
              </PokeFormControl>
              <PokeSelectContent>
                <div className="bg-slate-100">
                  {options.map((option) => (
                    <PokeSelectItem key={option} value={option}>
                      {option}
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

function TemplatesPage(
  _props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  void _props;

  function onSubmit(values: FormSchema) {
    console.log(values);
  }

  const form = useForm<FormSchema>({
    resolver: ioTsResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      presetHandle: "",
      presetInstructions: "",
      presetModel: GPT_4_TURBO_MODEL_CONFIG.modelId,
      presetTemperature: "balanced",
      presetAction: "reply",
      helpInstructions: "",
      helpActions: "",
      tags: [],
    },
  });

  return (
    <div className="min-h-screen bg-structure-50 pb-48">
      <PokeNavbar />
      <div className="mx-auto h-full max-w-2xl flex-grow flex-col items-center justify-center pt-8">
        <PokeForm {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <InputField
              control={form.control}
              name="name"
              placeholder="My Template"
            />
            <InputField
              control={form.control}
              name="description"
              placeholder="A short description"
            />
            <InputField
              control={form.control}
              name="presetHandle"
              placeholder="my-assistant"
            />
            <TextareaField
              control={form.control}
              name="presetInstructions"
              placeholder="Instructions"
            />
            <SelectField
              control={form.control}
              name="presetModel"
              title="Preset Model"
              options={USED_MODEL_CONFIGS.map((config) => config.modelId)}
            />
            <SelectField
              control={form.control}
              name="presetTemperature"
              title="Preset Temperature"
              options={["deterministic", "factual", "balanced", "creative"]}
            />
            <SelectField
              control={form.control}
              name="presetAction"
              title="Preset Action"
              options={[
                "reply",
                "search_datasources",
                "process_datasources",
                "query_tables",
              ]}
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
                      value={field.value.map((tag) => ({
                        label: tag,
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
