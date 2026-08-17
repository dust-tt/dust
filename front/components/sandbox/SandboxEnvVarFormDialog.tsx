import { ALLOWED_DOMAINS_HELPER_TEXT } from "@app/components/sandbox/env_var_display";
import {
  ENV_VAR_NAME_SUFFIX_REGEX,
  envVarPrefixForKind,
  MAX_HTTPS_SECRET_VALUE_BYTES,
  MAX_VALUE_BYTES,
} from "@app/lib/api/sandbox/env_vars";
import {
  useBulkUpsertSandboxEnvVar,
  useUpsertSandboxEnvVar,
} from "@app/lib/swr/sandbox";
import { normalizeEgressPolicyDomains } from "@app/types/sandbox/egress_policy";
import type { SandboxEnvVarType } from "@app/types/sandbox/env_var";
import { SANDBOX_ENV_VAR_KINDS } from "@app/types/sandbox/env_var";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  CheckboxWithText,
  ContentMessage,
  CubeOutline,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Globe01,
  Input,
  Label,
  Lock01,
  Page,
  RadioGroup,
  RadioGroupItem,
  SearchInput,
  SliderToggle,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useController, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

const NAME_HELPER_TEXT =
  "Uppercase letters, digits and underscores. Up to 64 characters after the prefix.";

export function parseAllowedDomainsText(value: string): string[] {
  return value
    .split(",")
    .map((domain) => domain.trim())
    .filter((domain) => domain.length > 0);
}

export function getEnvVarSuffix(envVar: SandboxEnvVarType): string {
  const prefix = envVarPrefixForKind(envVar.kind);
  return envVar.name.startsWith(prefix)
    ? envVar.name.slice(prefix.length)
    : envVar.name;
}

const formSchema = z
  .object({
    name: z
      .string()
      .min(1, NAME_HELPER_TEXT)
      .regex(
        ENV_VAR_NAME_SUFFIX_REGEX,
        "Suffix must start with A-Z and then use only A-Z, 0-9, or underscore, up to 64 characters."
      ),
    value: z.string().min(1, "Value is required."),
    kind: z.enum(SANDBOX_ENV_VAR_KINDS),
    allowedDomainsText: z.string(),
    applyTo: z.enum(["workspace", "pods"]),
    selectedPodIds: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    if (data.applyTo === "pods" && data.selectedPodIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["selectedPodIds"],
        message: "Select at least one Pod.",
      });
    }

    const valueBytes = new TextEncoder().encode(data.value).length;

    switch (data.kind) {
      case "config": {
        if (data.value.includes("\u0000")) {
          ctx.addIssue({
            code: "custom",
            path: ["value"],
            message: "Values cannot contain NUL bytes.",
          });
        }
        if (valueBytes > MAX_VALUE_BYTES) {
          ctx.addIssue({
            code: "custom",
            path: ["value"],
            message: "Values cannot exceed 32 KiB.",
          });
        }
        return;
      }

      case "https_secret": {
        if (/[\u0000-\u001F\u007F]/.test(data.value)) {
          ctx.addIssue({
            code: "custom",
            path: ["value"],
            message: "HTTPS secret values cannot contain ASCII control bytes.",
          });
        }
        if (valueBytes > MAX_HTTPS_SECRET_VALUE_BYTES) {
          ctx.addIssue({
            code: "custom",
            path: ["value"],
            message: `HTTPS secret values cannot exceed ${
              MAX_HTTPS_SECRET_VALUE_BYTES / 1_024
            } KiB.`,
          });
        }

        const allowedDomains = parseAllowedDomainsText(data.allowedDomainsText);
        if (allowedDomains.length === 0) {
          ctx.addIssue({
            code: "custom",
            path: ["allowedDomainsText"],
            message: "HTTPS secrets require at least one allowed domain.",
          });
          return;
        }

        const normalizedDomains = normalizeEgressPolicyDomains(allowedDomains);
        if (normalizedDomains.isErr()) {
          ctx.addIssue({
            code: "custom",
            path: ["allowedDomainsText"],
            message: normalizedDomains.error.message,
          });
        }
        return;
      }

      default:
        assertNeverAndIgnore(data.kind);
        return;
    }
  });

type FormValues = z.infer<typeof formSchema>;

export type SandboxEnvVarPodOption = { sId: string; name: string };

export type SandboxEnvVarFormDialogMode =
  | { kind: "create" }
  | { kind: "replace"; envVar: SandboxEnvVarType }
  | { kind: "override"; envVar: SandboxEnvVarType };

interface SandboxEnvVarFormDialogProps {
  owner: LightWorkspaceType;
  mode: SandboxEnvVarFormDialogMode;
  onClose: () => void;
  // Called after a successful save, before closing — mutate lists here.
  onSaved?: () => void;
  // Single-scope save target: a pod space sId, or undefined for the
  // workspace. Ignored when the save targets specific Pods.
  spaceId?: string;
  // Existing vars in the single-scope target, for collision messaging.
  existingEnvVars: SandboxEnvVarType[];
  // Enables saving to specific Pods (bulk, one independently scoped row per
  // Pod). Required for override mode.
  podTargeting?: {
    pods: SandboxEnvVarPodOption[];
    initialSelectedPodIds?: string[];
  };
}

function defaultValuesForMode(
  mode: SandboxEnvVarFormDialogMode,
  podTargeting: SandboxEnvVarFormDialogProps["podTargeting"]
): FormValues {
  const initialPodIds = podTargeting?.initialSelectedPodIds ?? [];
  switch (mode.kind) {
    case "create":
      return {
        name: "",
        value: "",
        kind: "config",
        allowedDomainsText: "",
        applyTo: initialPodIds.length > 0 ? "pods" : "workspace",
        selectedPodIds: initialPodIds,
      };
    case "replace":
      return {
        name: getEnvVarSuffix(mode.envVar),
        value: "",
        kind: mode.envVar.kind,
        allowedDomainsText: mode.envVar.allowedDomains?.join(", ") ?? "",
        applyTo: "workspace",
        selectedPodIds: [],
      };
    case "override":
      return {
        name: getEnvVarSuffix(mode.envVar),
        value: "",
        kind: mode.envVar.kind,
        allowedDomainsText: mode.envVar.allowedDomains?.join(", ") ?? "",
        applyTo: "pods",
        selectedPodIds: initialPodIds,
      };
    default:
      assertNeverAndIgnore(mode);
      return {
        name: "",
        value: "",
        kind: "config",
        allowedDomainsText: "",
        applyTo: "workspace",
        selectedPodIds: [],
      };
  }
}

interface PodChecklistProps {
  pods: SandboxEnvVarPodOption[];
  selectedPodIds: string[];
  onChange: (podIds: string[]) => void;
  disabled: boolean;
  errorMessage?: string;
}

// Searchable checkbox list for Pod targeting inside the dialog form.
function PodChecklist({
  pods,
  selectedPodIds,
  onChange,
  disabled,
  errorMessage,
}: PodChecklistProps) {
  const [searchText, setSearchText] = useState("");
  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredPods = normalizedSearchText
    ? pods.filter((pod) =>
        pod.name.toLowerCase().includes(normalizedSearchText)
      )
    : pods;
  const selectedPodIdsSet = new Set(selectedPodIds);

  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        name="search-pods"
        placeholder="Search Pods"
        value={searchText}
        onChange={setSearchText}
        disabled={disabled}
      />
      <div className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-3">
        {pods.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            No Pods available.
          </span>
        ) : filteredPods.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            No matching Pods.
          </span>
        ) : (
          filteredPods.map((pod) => (
            <CheckboxWithText
              key={pod.sId}
              text={pod.name}
              checked={selectedPodIdsSet.has(pod.sId)}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange(
                  checked === true
                    ? [...selectedPodIds, pod.sId]
                    : selectedPodIds.filter((id) => id !== pod.sId)
                )
              }
            />
          ))
        )}
      </div>
      <span
        className={
          errorMessage
            ? "text-xs text-foreground-warning"
            : "text-xs text-muted-foreground"
        }
      >
        {errorMessage ??
          `${selectedPodIds.length} Pod${selectedPodIds.length === 1 ? "" : "s"} selected.`}
      </span>
    </div>
  );
}

export function SandboxEnvVarFormDialog({
  owner,
  mode,
  onClose,
  onSaved,
  spaceId,
  existingEnvVars,
  podTargeting,
}: SandboxEnvVarFormDialogProps) {
  const { upsertSandboxEnvVar, isUpsertingSandboxEnvVar } =
    useUpsertSandboxEnvVar({ owner, spaceId });
  const { bulkUpsertSandboxEnvVar, isBulkUpsertingSandboxEnvVar } =
    useBulkUpsertSandboxEnvVar({ owner });
  const isSaving = isUpsertingSandboxEnvVar || isBulkUpsertingSandboxEnvVar;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValuesForMode(mode, podTargeting),
    mode: "onChange",
  });
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    trigger,
  } = form;
  const { field: nameField } = useController({ control, name: "name" });
  const { field: kindField } = useController({ control, name: "kind" });
  const { field: applyToField } = useController({ control, name: "applyTo" });
  const { field: selectedPodIdsField } = useController({
    control,
    name: "selectedPodIds",
  });
  const nameValue = nameField.value;
  const valueValue = useWatch({ control, name: "value" });
  const kindValue = useWatch({ control, name: "kind" });
  const allowedDomainsTextValue = useWatch({
    control,
    name: "allowedDomainsText",
  });

  const isNameLocked = mode.kind !== "create";
  const targetsPods =
    podTargeting !== undefined &&
    (mode.kind === "override" || applyToField.value === "pods");
  const showApplyToControl =
    mode.kind === "create" && podTargeting !== undefined;
  const showDomainsInput =
    mode.kind === "create" ||
    (mode.kind === "override" && mode.envVar.kind === "https_secret");

  const namePrefix = envVarPrefixForKind(kindValue);
  const fullName = nameValue ? `${namePrefix}${nameValue}` : "";
  // Collision messaging is single-scope only: with Pod targeting the same
  // name can exist in some Pods and not others, and the save is an upsert in
  // each of them.
  const existingEnvVarForSuffix = targetsPods
    ? undefined
    : existingEnvVars.find((envVar) => getEnvVarSuffix(envVar) === nameValue);
  const isReplacing =
    mode.kind === "replace" || existingEnvVarForSuffix?.name === fullName;
  const isNameTakenByOtherKind =
    !isNameLocked &&
    existingEnvVarForSuffix !== undefined &&
    existingEnvVarForSuffix.name !== fullName;
  const nameMessage = (() => {
    if (errors.name) {
      return {
        message: errors.name.message ?? NAME_HELPER_TEXT,
        isError: true,
      };
    }
    if (nameValue.length === 0) {
      return { message: NAME_HELPER_TEXT, isError: false };
    }
    if (isNameTakenByOtherKind) {
      return {
        message: `A variable with this suffix already exists as ${
          existingEnvVarForSuffix?.name ?? fullName
        }.`,
        isError: true,
      };
    }
    if (targetsPods && mode.kind === "create") {
      return {
        message:
          "Existing variables with this name in the selected Pods will have their value replaced.",
        isError: false,
      };
    }
    return {
      message: isReplacing
        ? "A variable with this name already exists. Saving will replace its value."
        : "This name can be saved.",
      isError: false,
    };
  })();
  const valueMessage = (() => {
    if (errors.value) {
      return { message: errors.value.message ?? "", isError: true };
    }
    const valueBytes = new TextEncoder().encode(valueValue).length;
    const maxBytes =
      kindValue === "https_secret"
        ? MAX_HTTPS_SECRET_VALUE_BYTES
        : MAX_VALUE_BYTES;
    const suffix =
      kindValue === "https_secret"
        ? "ASCII control bytes are not allowed."
        : "Multiline values are allowed.";
    return {
      message: `${valueBytes} / ${maxBytes} bytes. ${suffix}`,
      isError: false,
    };
  })();
  const allowedDomainsMessage = (() => {
    if (kindValue !== "https_secret") {
      return null;
    }
    if (errors.allowedDomainsText) {
      return {
        message: errors.allowedDomainsText.message ?? "",
        isError: true,
      };
    }

    const allowedDomains = parseAllowedDomainsText(allowedDomainsTextValue);
    if (allowedDomains.length === 0) {
      return { message: ALLOWED_DOMAINS_HELPER_TEXT, isError: false };
    }

    const normalizedDomains = normalizeEgressPolicyDomains(allowedDomains);
    if (normalizedDomains.isErr()) {
      return { message: normalizedDomains.error.message, isError: true };
    }

    return {
      message: `Will be saved as ${normalizedDomains.value.join(", ")}.`,
      isError: false,
    };
  })();
  const canSave =
    nameValue.length > 0 &&
    valueValue.length > 0 &&
    !errors.name &&
    !errors.value &&
    !errors.allowedDomainsText &&
    !isNameTakenByOtherKind &&
    (!targetsPods || selectedPodIdsField.value.length > 0) &&
    !isSaving;

  const title = (() => {
    switch (mode.kind) {
      case "create":
        return isReplacing ? "Replace variable" : "Add variable";
      case "replace":
        return "Replace variable";
      case "override":
        return `Override ${mode.envVar.name} in Pods`;
      default:
        assertNeverAndIgnore(mode);
        return "";
    }
  })();

  const onSubmit = async (data: FormValues) => {
    // Replace mode keeps the row's stored domains (`undefined` on the wire).
    const shouldSendDomains =
      data.kind === "https_secret" && mode.kind !== "replace";
    const normalizedDomains = shouldSendDomains
      ? normalizeEgressPolicyDomains(
          parseAllowedDomainsText(data.allowedDomainsText)
        )
      : null;
    if (normalizedDomains?.isErr() === true) {
      return;
    }

    const payload = {
      name: `${envVarPrefixForKind(data.kind)}${data.name}`,
      value: data.value,
      kind: data.kind,
      allowedDomains:
        normalizedDomains?.isOk() === true
          ? normalizedDomains.value
          : undefined,
    };

    const success = targetsPods
      ? await bulkUpsertSandboxEnvVar({
          ...payload,
          pods: (podTargeting?.pods ?? []).filter((pod) =>
            data.selectedPodIds.includes(pod.sId)
          ),
        })
      : await upsertSandboxEnvVar(payload);
    if (success) {
      onSaved?.();
      onClose();
    }
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Page.Vertical align="stretch" gap="md">
            {mode.kind === "override" ? (
              <ContentMessage variant="info" icon={CubeOutline} size="sm">
                Creates an independent copy of this variable in each selected
                Pod. The workspace value is unchanged, and Pod values can
                diverge later. Enter the value once — it is applied to every
                selected Pod.
              </ContentMessage>
            ) : null}
            {showApplyToControl ? (
              <div className="flex flex-col gap-2">
                <Label>Scope</Label>
                <RadioGroup
                  value={applyToField.value}
                  onValueChange={(value) => {
                    applyToField.onChange(value);
                  }}
                >
                  <RadioGroupItem
                    id="sandbox-env-var-apply-workspace"
                    value="workspace"
                    label="Workspace-wide"
                    disabled={isSaving}
                  />
                  <RadioGroupItem
                    id="sandbox-env-var-apply-pods"
                    value="pods"
                    label="Specific Pods"
                    disabled={isSaving}
                  />
                </RadioGroup>
                {applyToField.value === "workspace" ? (
                  <span className="text-xs text-muted-foreground">
                    A workspace-wide value doesn't clear existing per-Pod
                    overrides; the Pod value still wins where set.
                  </span>
                ) : null}
                {applyToField.value === "pods" && podTargeting ? (
                  <PodChecklist
                    pods={podTargeting.pods}
                    selectedPodIds={selectedPodIdsField.value}
                    onChange={(podIds) => selectedPodIdsField.onChange(podIds)}
                    disabled={isSaving}
                    errorMessage={errors.selectedPodIds?.message}
                  />
                ) : null}
              </div>
            ) : null}
            {mode.kind === "create" ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <Label>HTTPS secret</Label>
                    <span className="text-xs text-muted-foreground">
                      Keep the value out of the Computer environment.
                    </span>
                  </div>
                  <SliderToggle
                    selected={kindField.value === "https_secret"}
                    disabled={isSaving}
                    onClick={() => {
                      kindField.onChange(
                        kindField.value === "https_secret"
                          ? "config"
                          : "https_secret"
                      );
                      void trigger(["value", "allowedDomainsText"]);
                    }}
                  />
                </div>
                <ContentMessage
                  variant={kindValue === "https_secret" ? "info" : "warning"}
                  icon={kindValue === "https_secret" ? Lock01 : Globe01}
                  size="sm"
                >
                  {kindValue === "https_secret" ? (
                    <>
                      Stored securely. The dsbx forwarder injects it only into
                      outbound HTTPS requests to whitelisted domains; Computer
                      code never reads it.
                    </>
                  ) : (
                    <>
                      Mounted as a prefixed env var on every new Computer and
                      read directly by the agent and any code it runs. Use for
                      non-sensitive values.
                    </>
                  )}
                </ContentMessage>
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <Label htmlFor="sandbox-env-var-name">Name</Label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-3 top-0 flex h-9 select-none items-center text-sm text-muted-foreground"
                  aria-hidden="true"
                  title={`The ${namePrefix} prefix is reserved and cannot be removed.`}
                >
                  {namePrefix}
                </span>
                <Input
                  id="sandbox-env-var-name"
                  type="text"
                  placeholder="API_TOKEN"
                  className={
                    namePrefix === envVarPrefixForKind("https_secret")
                      ? "pl-14"
                      : "pl-11"
                  }
                  isError={nameMessage.isError}
                  message={nameMessage.message}
                  messageStatus={nameMessage.isError ? "error" : "info"}
                  disabled={isSaving || isNameLocked}
                  ref={nameField.ref}
                  name={nameField.name}
                  value={nameField.value}
                  onBlur={nameField.onBlur}
                  onChange={(event) =>
                    nameField.onChange(event.target.value.toUpperCase())
                  }
                />
              </div>
            </div>
            {showDomainsInput ? (
              <div
                className={
                  kindValue === "https_secret"
                    ? undefined
                    : "pointer-events-none opacity-40"
                }
                aria-disabled={kindValue !== "https_secret"}
              >
                <Input
                  label="Allowed domains"
                  placeholder="e.g. api.openai.com, *.mistral.ai"
                  message={
                    kindValue === "https_secret"
                      ? allowedDomainsMessage?.message
                      : "Only used when HTTPS secret is on."
                  }
                  messageStatus={
                    kindValue === "https_secret" &&
                    allowedDomainsMessage?.isError
                      ? "error"
                      : "info"
                  }
                  disabled={isSaving || kindValue !== "https_secret"}
                  {...register("allowedDomainsText")}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <Label htmlFor="sandbox-env-var-value">Value</Label>
              <TextArea
                id="sandbox-env-var-value"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-form-type="other"
                minRows={8}
                placeholder="Paste the secret value"
                error={valueMessage.isError ? valueMessage.message : null}
                showErrorLabel={false}
                resize="vertical"
                disabled={isSaving}
                {...register("value")}
              />
              <div
                className={
                  valueMessage.isError
                    ? "text-xs text-foreground-warning"
                    : "text-xs text-muted-foreground"
                }
              >
                {valueMessage.message}
              </div>
            </div>
            {mode.kind === "override" && podTargeting ? (
              <PodChecklist
                pods={podTargeting.pods}
                selectedPodIds={selectedPodIdsField.value}
                onChange={(podIds) => selectedPodIdsField.onChange(podIds)}
                disabled={isSaving}
                errorMessage={errors.selectedPodIds?.message}
              />
            ) : null}
          </Page.Vertical>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label:
              mode.kind === "override"
                ? "Create overrides"
                : isReplacing
                  ? "Replace"
                  : "Save",
            icon: Lock01,
            onClick: () => {
              void handleSubmit(onSubmit)();
            },
            disabled: !canSave,
            isLoading: isSaving,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
