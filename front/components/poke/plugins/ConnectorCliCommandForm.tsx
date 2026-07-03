import { EnumSelect } from "@app/components/poke/plugins/EnumSelect";
import {
  PokeForm,
  PokeFormDescription,
  PokeFormInput,
  PokeFormItem,
  PokeFormLabel,
} from "@app/components/poke/shadcn/ui/form";
import { buildAdminRunArgs } from "@app/lib/api/poke/plugins/data_sources/args_json";
import {
  buildConnectorCommandOptions,
  IMPLIED_CONTEXT_PARAMS,
  parseConnectorCommandValue,
} from "@app/lib/api/poke/plugins/data_sources/connector_cli_commands";
import { usePokeDataSourceDetails } from "@app/poke/swr/data_source_details";
import { usePokeConnectorCliCatalog } from "@app/poke/swr/plugins";
import type { CliCommandGroup } from "@app/types/connectors/admin/catalog";
import type { EnumValue, PluginResourceTarget } from "@app/types/poke/plugins";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Checkbox, Spinner } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

type SubmitArgs = {
  majorCommand: string;
  command: string;
  argsJson: string;
};

interface ConnectorCliCommandFormProps {
  disabled?: boolean;
  onSubmit: (args: SubmitArgs) => Promise<void>;
  pluginResourceTarget: PluginResourceTarget;
}

export function ConnectorCliCommandForm({
  disabled,
  onSubmit,
  pluginResourceTarget,
}: ConnectorCliCommandFormProps) {
  // This plugin is data-source-scoped, so the target always carries a
  // workspace and a data source id. Guard defensively without any hooks so we
  // can hand the inner form concrete, non-null values.
  const owner =
    "workspace" in pluginResourceTarget ? pluginResourceTarget.workspace : null;
  const dsId =
    "resourceId" in pluginResourceTarget
      ? pluginResourceTarget.resourceId
      : null;

  if (!owner || !dsId) {
    return (
      <div className="text-warning-500">
        This plugin can only run from a data source.
      </div>
    );
  }

  return (
    <ConnectorCliCommandFormInner
      disabled={disabled}
      dsId={dsId}
      onSubmit={onSubmit}
      owner={owner}
    />
  );
}

interface ConnectorCliCommandFormInnerProps {
  disabled?: boolean;
  dsId: string;
  onSubmit: (args: SubmitArgs) => Promise<void>;
  owner: LightWorkspaceType;
}

function ConnectorCliCommandFormInner({
  disabled,
  dsId,
  onSubmit,
  owner,
}: ConnectorCliCommandFormInnerProps) {
  const { catalog, isLoading: isCatalogLoading } = usePokeConnectorCliCatalog({
    disabled: false,
  });
  const { data: dataSourceDetails, isLoading: isDataSourceLoading } =
    usePokeDataSourceDetails({ owner, dsId, disabled: false });

  // `PokeForm*` primitives (and `EnumSelect`, which wraps its trigger in
  // `PokeFormControl`) call react-hook-form's `useFormContext()` internally
  // and crash if there is no ancestor `FormProvider`. This form keeps its
  // values in plain `useState`; `useForm()` only satisfies that context
  // requirement.
  const formContextOnly = useForm();

  // Selected command, encoded as "<majorCommand>::<command>".
  const [commandValue, setCommandValue] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const connectorProvider =
    dataSourceDetails?.dataSource.connectorProvider ?? null;

  const commandOptions: EnumValue[] = useMemo(() => {
    if (!catalog || !connectorProvider) {
      return [];
    }
    return buildConnectorCommandOptions(catalog, connectorProvider);
  }, [catalog, connectorProvider]);

  const parsedCommand = useMemo(
    () => (commandValue ? parseConnectorCommandValue(commandValue) : null),
    [commandValue]
  );

  const selectedGroup: CliCommandGroup | null = useMemo(() => {
    if (!catalog || !parsedCommand) {
      return null;
    }
    return (
      catalog.groups.find(
        (g) => g.majorCommand === parsedCommand.majorCommand
      ) ?? null
    );
  }, [catalog, parsedCommand]);

  // Params to fill in: the selected command's group options, minus the ones
  // implied from the data source context.
  const visibleOptions = useMemo(
    () =>
      (selectedGroup?.options ?? []).filter(
        (option) => !IMPLIED_CONTEXT_PARAMS.includes(option.name)
      ),
    [selectedGroup]
  );

  if (isCatalogLoading || isDataSourceLoading) {
    return <Spinner />;
  }

  if (!catalog || !connectorProvider) {
    return (
      <div className="text-warning-500">
        Could not load the connector CLI commands for this data source.
      </div>
    );
  }

  const canRun =
    parsedCommand !== null && selectedGroup !== null && !isSubmitted;

  const handleRun = async () => {
    if (!parsedCommand || !selectedGroup) {
      return;
    }
    setIsSubmitted(true);
    const args = buildAdminRunArgs(paramValues, visibleOptions);
    await onSubmit({
      majorCommand: parsedCommand.majorCommand,
      command: parsedCommand.command,
      argsJson: JSON.stringify(args),
    });
  };

  const setParam = (name: string, value: string) =>
    setParamValues((prev) => ({ ...prev, [name]: value }));

  return (
    <PokeForm {...formContextOnly}>
      <div className="flex max-w-[600px] flex-col gap-y-4">
        <div className="flex max-h-[50vh] flex-col gap-y-6 overflow-y-auto pr-2">
          <PokeFormItem>
            <PokeFormLabel>Command</PokeFormLabel>
            <PokeFormDescription>
              Commands available for this {connectorProvider} connector.
            </PokeFormDescription>
            <EnumSelect
              label="Command"
              fullWidth
              options={commandOptions}
              values={commandValue ? [commandValue] : []}
              multiple={false}
              onValuesChange={(values) => {
                setCommandValue(values[0] ?? null);
                setParamValues({});
              }}
            />
          </PokeFormItem>

          {selectedGroup &&
            visibleOptions.map((option) => (
              <PokeFormItem key={option.name}>
                {option.isBoolean ? (
                  <div className="flex flex-row items-center gap-x-2">
                    <Checkbox
                      checked={paramValues[option.name] === "true"}
                      onCheckedChange={(checked) =>
                        setParam(option.name, checked ? "true" : "")
                      }
                    />
                    <PokeFormLabel>{option.name}</PokeFormLabel>
                  </div>
                ) : (
                  <>
                    <PokeFormLabel>{option.name}</PokeFormLabel>
                    <PokeFormInput
                      type={option.isNumber ? "number" : "text"}
                      value={paramValues[option.name] ?? ""}
                      onChange={(e) => setParam(option.name, e.target.value)}
                    />
                  </>
                )}
                {option.description && (
                  <PokeFormDescription>
                    {option.description}
                  </PokeFormDescription>
                )}
              </PokeFormItem>
            ))}
        </div>

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
