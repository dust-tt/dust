import { ioTsResolver } from "@hookform/resolvers/io-ts";
import * as t from "io-ts";
import React from "react";
import { FormProvider, useForm } from "react-hook-form";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import { InputField } from "@app/components/poke/shadcn/ui/form/fields";
import { useSubmitFunction } from "@app/lib/client/utils";

interface SlackChannelPatternInputProps {
  initialValue: string | null;
  ownerSId: string;
}

export const SlackChannelFormSchema = t.type({
  inputValue: t.union([t.string, t.null]),
});

export type SlackChannelFormType = t.TypeOf<typeof SlackChannelFormSchema>;

export function SlackChannelPatternInput({
  initialValue,
  ownerSId,
}: SlackChannelPatternInputProps) {
  const formMethods = useForm<SlackChannelFormType>({
    resolver: ioTsResolver(SlackChannelFormSchema),
    defaultValues: {
      inputValue: initialValue,
    },
  });

  const { submit: handleWhiteListedChannelPatternChange } = useSubmitFunction(
    async (newValue: string | null) => {
      try {
        const r = await fetch(
          `/api/poke/workspaces/${ownerSId}/data_sources/managed-slack/config`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              configKey: "whiteListedChannelPattern",
              configValue: newValue,
            }),
          }
        );
        if (!r.ok) {
          throw new Error("Failed to update whiteListedChannelPattern.");
        }
      } catch (e) {
        console.error(e);
        window.alert(
          "An error occurred while updating whiteListedChannelPattern."
        );
      }
    }
  );

  const handleSave = async (values: SlackChannelFormType) => {
    await handleWhiteListedChannelPatternChange(values.inputValue);
  };

  const handleClear = async () => {
    formMethods.reset({ inputValue: "" });
    await handleWhiteListedChannelPatternChange("");
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
