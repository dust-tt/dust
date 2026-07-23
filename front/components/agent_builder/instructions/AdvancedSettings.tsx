import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ModelSelectionSubmenu } from "@app/components/agent_builder/instructions/ModelSelectionSubmenu";
import { ReasoningEffortSubmenu } from "@app/components/agent_builder/instructions/ReasoningEffortSubmenu";
import { SuspensedCodeEditor } from "@app/components/SuspensedCodeEditor";
import { ModelPickerItems } from "@app/components/shared/model_picker/ModelPickerContent";
import type {
  ModelTierId,
  Selection,
} from "@app/components/shared/model_picker/modelPickerUtils";
import {
  getInitialEffort,
  getModelTier,
  groupModelsByMaker,
  resolveAgentDefault,
} from "@app/components/shared/model_picker/modelPickerUtils";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useClientType } from "@app/lib/context/clientType";
import { useModels } from "@app/lib/swr/models";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { isSupportingResponseFormat } from "@app/types/assistant/assistant";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { validateResponseFormat } from "@app/types/assistant/models/utils";
import {
  Button,
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  File04,
} from "@dust-tt/sparkle";
import React, { useMemo, useRef, useState } from "react";
import { useController, useWatch } from "react-hook-form";

function getResponseFormatError(value: string): string | null {
  if (value.trim() === "") {
    return null;
  }
  const result = validateResponseFormat(value);
  return result.isValid ? null : result.errorMessage;
}

const RESPONSE_FORMAT_PLACEHOLDER =
  "Example:\n\n" +
  "{\n" +
  '  "type": "json_schema",\n' +
  '  "json_schema": {\n' +
  '    "name": "YourSchemaName",\n' +
  '    "strict": true,\n' +
  '    "schema": {\n' +
  '      "type": "object",\n' +
  '      "properties": {\n' +
  '        "property1":\n' +
  '          { "type":"string" }\n' +
  "      },\n" +
  '      "required": ["property1"],\n' +
  '      "additionalProperties": false\n' +
  "    }\n" +
  "  }\n" +
  "}";

export function AdvancedSettings() {
  const { isDark } = useTheme();
  const { owner } = useAgentBuilderContext();
  const { hasFeature } = useFeatureFlags();
  const hasModelsPicker = hasFeature("models_picker");
  const isMobile = useIsMobile();
  const clientType = useClientType();
  const isWidthConstrained = isMobile || clientType === "extension";

  const { models } = useModels({ owner });

  const { field: modelSettingsField } = useController<
    AgentBuilderFormData,
    "generationSettings.modelSettings"
  >({
    name: "generationSettings.modelSettings",
  });
  const { field: reasoningEffortField } = useController<
    AgentBuilderFormData,
    "generationSettings.reasoningEffort"
  >({
    name: "generationSettings.reasoningEffort",
  });
  const { field: responseFormatField } = useController<
    AgentBuilderFormData,
    "generationSettings.responseFormat"
  >({
    name: "generationSettings.responseFormat",
  });

  const modelSettings = useWatch<
    AgentBuilderFormData,
    "generationSettings.modelSettings"
  >({ name: "generationSettings.modelSettings" });
  const reasoningEffort = useWatch<
    AgentBuilderFormData,
    "generationSettings.reasoningEffort"
  >({ name: "generationSettings.reasoningEffort" });
  const temperature = useWatch<
    AgentBuilderFormData,
    "generationSettings.temperature"
  >({ name: "generationSettings.temperature" });

  const [isResponseFormatDialogOpen, setIsResponseFormatDialogOpen] =
    React.useState(false);
  const [tempResponseFormat, setTempResponseFormat] = React.useState<
    string | null
  >(null);

  // Model picker state (mirrors InputBarModelPicker), scoped to the dropdown.
  const [search, setSearch] = useState("");
  const [moreModelsExpanded, setMoreModelsExpanded] = useState(false);
  const [expandedMaker, setExpandedMaker] = useState<ModelMakerIdType | null>(
    null
  );

  // Concrete, selectable models (meta-models surface as tiers instead).
  const allModels = useMemo<ModelConfigurationType[]>(
    () =>
      models.filter(
        (model) => !isModelStreamId(model.modelId) && model.isSelectable
      ),
    [models]
  );
  const makerGroups = useMemo(() => groupModelsByMaker(allModels), [allModels]);

  // The picker's current selection, derived from the form's model settings.
  const shown = useMemo<Selection>(
    () =>
      resolveAgentDefault({
        agentModel: modelSettings
          ? {
              providerId: modelSettings.providerId,
              modelId: modelSettings.modelId,
              temperature,
              reasoningEffort: reasoningEffort ?? undefined,
            }
          : null,
        models,
      }),
    [modelSettings, reasoningEffort, temperature, models]
  );

  // Picking a concrete model (or nudging its effort slider) must keep the menu
  // and its open submenus visible; the click briefly moves focus/pointer in a
  // way Radix treats as an interaction-outside. Record the pick time and veto
  // the close that immediately follows it (same pattern as InputBarModelPicker).
  const lastModelInteractionAtMsRef = useRef(0);
  const shouldBlockDismiss = () =>
    Date.now() - lastModelInteractionAtMsRef.current < 300;

  const onSelectTier = (tierId: ModelTierId) => {
    const { metaModelId } = getModelTier(tierId);
    modelSettingsField.onChange({
      modelId: metaModelId,
      providerId: metaModelId,
    });
    reasoningEffortField.onChange("none");
  };

  const onSelectModel = (model: ModelConfigurationType) => {
    lastModelInteractionAtMsRef.current = Date.now();
    modelSettingsField.onChange({
      modelId: model.modelId,
      providerId: model.providerId,
    });
    reasoningEffortField.onChange(getInitialEffort(model));
  };

  const onChangeEffort = (effort: ReasoningEffort) => {
    lastModelInteractionAtMsRef.current = Date.now();
    reasoningEffortField.onChange(effort);
  };

  if (!models) {
    return null;
  }

  const currentValue = tempResponseFormat ?? responseFormatField.value ?? "";
  const validationError = getResponseFormatError(currentValue);

  const supportsResponseFormat =
    modelSettingsField.value &&
    isSupportingResponseFormat(modelSettingsField.value.modelId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button label="Advanced" variant="outline" size="sm" isSelect />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          onInteractOutside={(e) => {
            if (shouldBlockDismiss()) {
              e.preventDefault();
            }
          }}
        >
          <DropdownMenuLabel label="Model selection" />

          {hasModelsPicker ? (
            <ModelPickerItems
              shouldBlockDismiss={shouldBlockDismiss}
              shown={shown}
              makerGroups={makerGroups}
              allModels={allModels}
              search={search}
              onSearchChange={setSearch}
              isWidthConstrained={isWidthConstrained}
              moreModelsExpanded={moreModelsExpanded}
              onToggleMoreModels={() => setMoreModelsExpanded((v) => !v)}
              expandedMaker={expandedMaker}
              onToggleMaker={(makerId) =>
                setExpandedMaker((current) =>
                  current === makerId ? null : makerId
                )
              }
              onSelectTier={onSelectTier}
              onSelectModel={onSelectModel}
              onChangeEffort={onChangeEffort}
            />
          ) : (
            <>
              <ModelSelectionSubmenu models={models} />
              <ReasoningEffortSubmenu models={models} />
            </>
          )}

          {supportsResponseFormat && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                label="Structured response format"
                onSelect={() => {
                  setTimeout(() => {
                    setTempResponseFormat(responseFormatField.value ?? null);
                    setIsResponseFormatDialogOpen(true);
                  }, 0);
                }}
              />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isResponseFormatDialogOpen}
        onOpenChange={setIsResponseFormatDialogOpen}
      >
        <DialogContent size="xl" height="lg">
          <DialogHeader>
            <DialogTitle visual={<File04 />}>
              Structured response format
            </DialogTitle>
            <DialogDescription>
              Specify a JSON schema to get responses in a consistent structure.{" "}
              <a
                href="https://docs.dust.tt/docs/structured-output-format"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                See documentation
              </a>
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <SuspensedCodeEditor
              data-color-mode={isDark ? "dark" : "light"}
              value={currentValue}
              placeholder={RESPONSE_FORMAT_PLACEHOLDER}
              name="responseFormat"
              onChange={(e) => setTempResponseFormat(e.target.value)}
              minHeight={400}
              className={cn(
                "rounded-lg bg-primary-100",
                validationError && "border-2 border-red-500 bg-primary-100"
              )}
              style={{
                fontSize: 13,
                fontFamily:
                  "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                overflowY: "auto",
              }}
              language="json"
            />
            {validationError && (
              <p className="text-sm text-red-500">{validationError}</p>
            )}
          </DialogContainer>
          <DialogFooter
            className="pt-2"
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setTempResponseFormat(null);
                setIsResponseFormatDialogOpen(false);
              },
            }}
            rightButtonProps={{
              label: "Save",
              disabled: !!validationError,
              onClick: () => {
                if (tempResponseFormat !== null) {
                  responseFormatField.onChange(tempResponseFormat);
                }
                setTempResponseFormat(null);
                setIsResponseFormatDialogOpen(false);
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
