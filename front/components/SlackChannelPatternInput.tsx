import { ioTsResolver } from "@hookform/resolvers/io-ts";
import * as t from "io-ts";
import React from "react";
import { FormProvider, useForm } from "react-hook-form";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import { InputField } from "@app/components/poke/shadcn/ui/form/fields";

interface MultiInputProps {
  initialValues: string;
  onValuesChange: (value: string) => void;
}

export const SlackChannelFormSchema = t.type({
  inputValue: t.string,
});

export type SlackChannelFormType = t.TypeOf<typeof SlackChannelFormSchema>;

export function SlackChannelPatternInput({
  initialValues,
  onValuesChange,
}: MultiInputProps) {
  const formMethods = useForm<SlackChannelFormType>({
    resolver: ioTsResolver(SlackChannelFormSchema),
    defaultValues: {
      inputValue: initialValues,
    },
  });

  const handleSave = (values: SlackChannelFormType) => {
    onValuesChange(values.inputValue);
  };

  const handleClear = () => {
    formMethods.reset({ inputValue: "" });
    onValuesChange("");
  };

  return (
    <FormProvider {...formMethods}>
      <form
        onSubmit={formMethods.handleSubmit(handleSave)}
        className="flex flex-col gap-4 text-sm"
      >
        <div className="flex flex-row items-end gap-2">
          <div className="flex-1">
            <InputField
              control={formMethods.control}
              name="inputValue"
              title="Channel Pattern"
              placeholder="#channel-pattern"
            />
          </div>
          <PokeButton
            type="submit"
            className="h-10 rounded-lg bg-blue-500 text-white"
          >
            Save
          </PokeButton>
          <PokeButton
            type="button"
            onClick={handleClear}
            className="h-10 rounded-lg bg-gray-500 text-white"
          >
            Clear
          </PokeButton>
        </div>
      </form>
    </FormProvider>
  );
}
