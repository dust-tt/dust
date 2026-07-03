import { EnumSelect } from "@app/components/poke/plugins/EnumSelect";
import {
  PokeForm,
  PokeFormDescription,
  PokeFormInput,
  PokeFormItem,
  PokeFormLabel,
} from "@app/components/poke/shadcn/ui/form";
import { buildAdminRunArgs } from "@app/lib/api/poke/plugins/global/args_json";
import { usePokeConnectorCliCatalog } from "@app/poke/swr/plugins";
import type { CliCommandGroup } from "@app/types/connectors/admin/catalog";
import type { EnumValue } from "@app/types/poke/plugins";
import { Button, Spinner } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

interface ConnectorCliCommandFormProps {
  disabled?: boolean;
  onSubmit: (args: {
    majorCommand: string;
    command: string;
    argsJson: string;
  }) => Promise<void>;
}

export function ConnectorCliCommandForm({
  disabled,
  onSubmit,
}: ConnectorCliCommandFormProps) {
  const { catalog, isLoading, isError } = usePokeConnectorCliCatalog({
    disabled: false,
  });

  // `PokeForm*` primitives (and `EnumSelect`, which wraps its trigger in
  // `PokeFormControl`) call react-hook-form's `useFormContext()` internally
  // and crash if there is no ancestor `FormProvider` (verified: rendering
  // `EnumSelect`/`PokeFormLabel`/`PokeFormDescription` with no `PokeForm`
  // ancestor throws `Cannot destructure property 'getFieldState' of null`).
  // This form does not register fields with react-hook-form or use its
  // state (values live in plain `useState` below); `useForm()` is only
  // used to satisfy that context requirement.
  const formContextOnly = useForm();

  const [group, setGroup] = useState<string | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const selectedGroup: CliCommandGroup | null = useMemo(
    () => catalog?.groups.find((g) => g.majorCommand === group) ?? null,
    [catalog, group]
  );

  const groupOptions: EnumValue[] = useMemo(
    () =>
      (catalog?.groups ?? []).map((g) => ({
        label: g.majorCommand,
        value: g.majorCommand,
      })),
    [catalog]
  );

  const commandOptions: EnumValue[] = useMemo(
    () =>
      (selectedGroup?.subcommands ?? []).map((c) => ({ label: c, value: c })),
    [selectedGroup]
  );

  if (isLoading) {
    return <Spinner />;
  }

  if (isError || !catalog) {
    return (
      <div className="text-warning-500">Could not load the CLI catalog.</div>
    );
  }

  const canRun = group !== null && command !== null && !isSubmitted;

  const handleRun = async () => {
    if (group === null || command === null || selectedGroup === null) {
      return;
    }
    setIsSubmitted(true);
    const args = buildAdminRunArgs(paramValues, selectedGroup.options);
    await onSubmit({
      majorCommand: group,
      command,
      argsJson: JSON.stringify(args),
    });
  };

  return (
    <PokeForm {...formContextOnly}>
      <div className="flex max-w-[600px] flex-col gap-y-6">
        <PokeFormItem>
          <PokeFormLabel>Command group</PokeFormLabel>
          <EnumSelect
            label="Command group"
            options={groupOptions}
            values={group ? [group] : []}
            multiple={false}
            onValuesChange={(values) => {
              setGroup(values[0] ?? null);
              setCommand(null);
              setParamValues({});
            }}
          />
        </PokeFormItem>

        {selectedGroup && (
          <PokeFormItem>
            <PokeFormLabel>Subcommand</PokeFormLabel>
            <PokeFormDescription>
              {selectedGroup.description}
            </PokeFormDescription>
            <EnumSelect
              label="Subcommand"
              options={commandOptions}
              values={command ? [command] : []}
              multiple={false}
              onValuesChange={(values) => setCommand(values[0] ?? null)}
            />
          </PokeFormItem>
        )}

        {selectedGroup &&
          command &&
          selectedGroup.options.map((option) => (
            <PokeFormItem key={option.name}>
              <PokeFormLabel>{option.name}</PokeFormLabel>
              <PokeFormInput
                type={option.isNumber ? "number" : "text"}
                value={paramValues[option.name] ?? ""}
                onChange={(e) =>
                  setParamValues((prev) => ({
                    ...prev,
                    [option.name]: e.target.value,
                  }))
                }
              />
              {option.description && (
                <PokeFormDescription>{option.description}</PokeFormDescription>
              )}
            </PokeFormItem>
          ))}

        <Button
          type="button"
          variant="outline"
          label="Run"
          disabled={disabled || !canRun}
          onClick={handleRun}
        />
      </div>
    </PokeForm>
  );
}
