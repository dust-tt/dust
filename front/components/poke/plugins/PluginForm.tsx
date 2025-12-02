import { Button, Checkbox, SliderToggle } from "@dust-tt/sparkle";
import { ioTsResolver } from "@hookform/resolvers/io-ts";
import type * as t from "io-ts";
import { useMemo, useState } from "react";
import React from "react";
import { useForm } from "react-hook-form";

import { EnumSelect } from "@app/components/poke/plugins/EnumSelect";
import {
  PokeForm,
  PokeFormControl,
  PokeFormDescription,
  PokeFormField,
  PokeFormInput,
  PokeFormItem,
  PokeFormLabel,
  PokeFormMessage,
  PokeFormTextArea,
  PokeFormUpload,
} from "@app/components/poke/shadcn/ui/form";
import type { PokeGetPluginDetailsResponseBody } from "@app/pages/api/poke/plugins/[pluginId]/manifest";
import type { AsyncEnumValues, EnumValues } from "@app/types";
import { createIoTsCodecFromArgs } from "@app/types";

type FallbackArgs = Record<string, unknown>;

type FormValues<T> = T extends t.TypeC<any> ? t.TypeOf<T> : FallbackArgs;

interface PluginFormProps {
  asyncArgs?: Partial<
    Record<string, string | number | boolean | AsyncEnumValues | EnumValues>
  > | null;
  disabled?: boolean;
  manifest: PokeGetPluginDetailsResponseBody["manifest"];
  onSubmit: (args: FormValues<any>) => Promise<void>;
}

export function PluginForm({
  asyncArgs,
  disabled,
  manifest,
  onSubmit,
}: PluginFormProps) {
  const [isSubmitted, setIsSubmitted] = useState(false);

  const argsCodec = useMemo(() => {
    if (!manifest) {
      return null;
    }

    // Create codec from original manifest - async values are handled in rendering
    return createIoTsCodecFromArgs(manifest.args);
  }, [manifest]);

  const defaultValues = useMemo(() => {
    if (!manifest) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(manifest.args).map(([key, arg]) => {
        switch (arg.type) {
          case "text":
            return [key, ""];
          case "string":
            return [key, ""];
          case "number":
            return [
              key,
              arg.async && asyncArgs?.[key] !== undefined
                ? (asyncArgs[key] as number)
                : 0,
            ];
          case "boolean":
            return [
              key,
              arg.async && asyncArgs?.[key] !== undefined
                ? (asyncArgs[key] as boolean)
                : false,
            ];
          case "enum":
            return [
              key,
              arg.async && asyncArgs?.[key] !== undefined
                ? (asyncArgs[key] as AsyncEnumValues)
                  .filter((v) => v.checked)
                  .map((v) => v.value)
                : arg.values.filter((v) => v.checked).map((v) => v.value),
            ];
          case "date":
            return [
              key,
              arg.async && asyncArgs?.[key] !== undefined
                ? (asyncArgs[key] as string)
                : "",
            ];
          default:
            return [key, null];
        }
      })
    );
  }, [manifest, asyncArgs]);

  const form = useForm({
    resolver: argsCodec ? ioTsResolver(argsCodec) : undefined,
    defaultValues,
  });

  const dependencyFields = useMemo(() => {
    if (!manifest) {
      return [];
    }
    return [
      ...new Set(
        Object.values(manifest.args)
          .filter((arg) => arg.dependsOn)
          .map((arg) => arg.dependsOn!.field)
      ),
    ];
  }, [manifest]);

  const watchedValuesArray = form.watch(dependencyFields);

  const watchedValues: Record<string, unknown> = {};
  dependencyFields.forEach((field, index) => {
    watchedValues[field] = watchedValuesArray[index];
  });

  async function handleSubmit(values: FormValues<typeof argsCodec>) {
    // Lock the form to prevent multiple submissions.
    setIsSubmitted(true);

    await onSubmit(values);
  }

  if (!manifest) {
    return null;
  }

  return (
    <PokeForm {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="max-w-[600px] space-y-8"
      >
        {Object.entries(manifest.args).map(([key, arg]) => {
          const isDependentFieldHidden =
            arg.dependsOn &&
            watchedValues[arg.dependsOn.field] !== arg.dependsOn.value;

          if (isDependentFieldHidden) {
            return null;
          }

          let defaultValue = undefined;
          let options = undefined;

          if (arg.type === "enum") {
            options =
              arg.async && asyncArgs?.[key]
                ? (asyncArgs[key] as AsyncEnumValues)
                : arg.values;
            defaultValue = options.filter((v) => v.checked).map((v) => v.value);
          }
          const fieldDescription =
            arg.asyncDescription &&
              asyncArgs?.[`${key}_description`] !== undefined
              ? String(asyncArgs[`${key}_description`])
              : arg.description;

          return (
            <PokeFormField
              key={key}
              control={form.control}
              name={key}
              disabled={disabled}
              defaultValue={defaultValue}
              render={({ field }) => (
                <PokeFormItem>
                  <div
                    className={
                      arg.type === "boolean"
                        ? "flex flex-row items-center gap-x-2"
                        : "flex flex-col gap-y-2"
                    }
                  >
                    <PokeFormLabel>{arg.label}</PokeFormLabel>
                    <PokeFormControl>
                      <>
                        {arg.type === "text" && <PokeFormTextArea {...field} />}
                        {arg.type === "string" && <PokeFormInput {...field} />}
                        {arg.type === "number" && (
                          <PokeFormInput
                            type="number"
                            {...field}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
                        )}
                        {arg.type === "boolean" && arg.variant === "toggle" && (
                          <SliderToggle
                            selected={field.value}
                            onClick={() => field.onChange(!field.value)}
                            disabled={field.disabled}
                          />
                        )}
                        {arg.type === "boolean" &&
                          (arg.variant === "checkbox" ||
                            arg.variant === undefined) && (
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          )}
                        {arg.type === "enum" && (
                          <EnumSelect
                            label={arg.label}
                            onValuesChange={(values) => field.onChange(values)}
                            options={options ?? []}
                            placeholder="Select value"
                            values={field.value}
                            multiple={arg.multiple}
                          />
                        )}
                        {arg.type === "file" && (
                          <PokeFormUpload type="file" {...field} />
                        )}
                        {arg.type === "date" && (
                          <PokeFormInput type="date" {...field} />
                        )}
                      </>
                    </PokeFormControl>
                  </div>
                  {fieldDescription && (
                    <PokeFormDescription>
                      {fieldDescription}
                    </PokeFormDescription>
                  )}
                  <PokeFormMessage />
                </PokeFormItem>
              )}
            />
          );
        })}
        <Button
          type="submit"
          variant="outline"
          disabled={isSubmitted}
          label="Run"
        />
      </form>
    </PokeForm>
  );
}
