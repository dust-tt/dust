import type { DataSourceType, LightWorkspaceType } from "@dust-tt/types";
import { ioTsResolver } from "@hookform/resolvers/io-ts";
import * as t from "io-ts";
import React, { useContext } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import { InputField } from "@app/components/poke/shadcn/ui/form/fields";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useSubmitFunction } from "@app/lib/client/utils";

interface SlackChannelPatternInputProps {
  initialValue: string;
  owner: LightWorkspaceType;
  dataSource: DataSourceType;
}

export const SlackChannelFormSchema = t.type({
  inputValue: t.string,
});

export type SlackChannelFormType = t.TypeOf<typeof SlackChannelFormSchema>;

export function SlackChannelPatternInput({
  initialValue,
  owner,
  dataSource,
}: SlackChannelPatternInputProps) {
  const formMethods = useForm<SlackChannelFormType>({
    resolver: ioTsResolver(SlackChannelFormSchema),
    defaultValues: {
      inputValue: initialValue,
    },
  });
  const sendNotification = useContext(SendNotificationsContext);

  const { submit: handleAutoReadChannelPatternChange } = useSubmitFunction(
    async (newValue: string) => {
      try {
        const r = await fetch(
          `/api/poke/workspaces/${owner.sId}/data_sources/${dataSource.sId}/config`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              configKey: "autoReadChannelPattern",
              configValue: newValue,
            }),
          }
        );
        if (!r.ok) {
          throw new Error("Failed to update autoReadChannelPattern.");
        }
        sendNotification({
          title: "Success!",
          description: "Slack channel pattern successfully updated.",
          type: "success",
        });
      } catch (e) {
        console.error(e);
        window.alert(
          "An error occurred while updating autoReadChannelPattern."
        );
      }
    }
  );

  const handleSave = async (values: SlackChannelFormType) => {
    await handleAutoReadChannelPatternChange(values.inputValue);
  };

  const handleClear = async () => {
    formMethods.reset({ inputValue: "" });
    await handleAutoReadChannelPatternChange("");
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
              title="Channel auto join/read pattern"
              placeholder="incidents-.*"
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
