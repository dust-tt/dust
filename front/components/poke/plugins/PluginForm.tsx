"use client";

import { createIoTsCodecFromArgs } from "@dust-tt/types";
import { ioTsResolver } from "@hookform/resolvers/io-ts";
import type * as t from "io-ts";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import { PokeCheckbox } from "@app/components/poke/shadcn/ui/checkbox";
import {
  PokeForm,
  PokeFormControl,
  PokeFormDescription,
  PokeFormField,
  PokeFormItem,
  PokeFormLabel,
  PokeFormMessage,
} from "@app/components/poke/shadcn/ui/form";
import { PokeInput } from "@app/components/poke/shadcn/ui/input";
import type { PokeGetPluginDetailsResponseBody } from "@app/pages/api/poke/plugins/[pluginId]/manifest";

type FallbackArgs = Record<string, unknown>;

type FormValues<T> = T extends t.TypeC<any> ? t.TypeOf<T> : FallbackArgs;

interface PluginFormProps {
  manifest: PokeGetPluginDetailsResponseBody["manifest"];
  onSubmit: (args: FormValues<any>) => Promise<void>;
}

export function PluginForm({ manifest, onSubmit }: PluginFormProps) {
  const argsCodec = useMemo(() => {
    if (!manifest) {
      return null;
    }
    return createIoTsCodecFromArgs(manifest.args);
  }, [manifest]);

  const defaultValues = useMemo(() => {
    if (!manifest) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(manifest.args).map(([key, arg]) => {
        switch (arg.type) {
          case "string":
            return [key, ""];
          case "number":
            return [key, 0];
          case "boolean":
            return [key, false];
          default:
            return [key, null];
        }
      })
    );
  }, [manifest]);

  const form = useForm({
    resolver: argsCodec ? ioTsResolver(argsCodec) : undefined,
    defaultValues,
  });

  async function handleSubmit(values: FormValues<typeof argsCodec>) {
    await onSubmit(values);
  }

  if (!manifest) {
    return null;
  }

  return (
    <PokeForm {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        {Object.entries(manifest.args).map(([key, arg]) => (
          <PokeFormField
            key={key}
            control={form.control}
            name={key}
            render={({ field }) => (
              <PokeFormItem>
                <PokeFormLabel>{arg.label}</PokeFormLabel>
                <PokeFormControl>
                  <>
                    {arg.type === "string" && <PokeInput {...field} />}
                    {arg.type === "number" && (
                      <PokeInput
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    )}
                    {arg.type === "boolean" && (
                      <PokeCheckbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  </>
                </PokeFormControl>
                {arg.description && (
                  <PokeFormDescription>{arg.description}</PokeFormDescription>
                )}
                <PokeFormMessage />
              </PokeFormItem>
            )}
          />
        ))}
        <PokeButton type="submit" variant="outline">
          Run
        </PokeButton>
      </form>
    </PokeForm>
  );
}
