import { normalizeEgressPolicyDomain } from "@app/types/sandbox/egress_policy";
import { Button, Input, Plus } from "@dust-tt/sparkle";
import { useState } from "react";

const DOMAIN_INPUT_HINT =
  "Use an exact domain such as api.openai.com or a wildcard such as *.mistral.ai.";

interface DomainInputFormProps {
  // A message when the normalized domain is a duplicate for the current scope
  // (which blocks submit), or null when it is addable.
  duplicateMessage: (normalizedDomain: string) => string | null;
  // Info message for a valid, non-duplicate domain (e.g. "Will be saved as X.").
  validMessage: (normalizedDomain: string) => string;
  // Persists the domain; resolves true on success so the input clears.
  onSubmit: (normalizedDomain: string) => Promise<boolean>;
  submitLabel: string;
  isUpdating: boolean;
}

// The add/request domain input: normalization, validation, and the input +
// submit button. Shared by the egress list editor and the multi-Pod network
// section; each supplies the scope-specific duplicate/valid wording and submit.
export function DomainInputForm({
  duplicateMessage,
  validMessage,
  onSubmit,
  submitLabel,
  isUpdating,
}: DomainInputFormProps) {
  const [domainInput, setDomainInput] = useState("");

  const hasDomainInput = domainInput.trim().length > 0;
  const domainInputResult = hasDomainInput
    ? normalizeEgressPolicyDomain(domainInput)
    : null;
  const normalizedDomain =
    domainInputResult?.isOk() === true ? domainInputResult.value : null;
  const duplicate =
    normalizedDomain !== null ? duplicateMessage(normalizedDomain) : null;
  const message =
    domainInputResult?.isErr() === true
      ? domainInputResult.error.message
      : duplicate !== null
        ? duplicate
        : normalizedDomain !== null
          ? validMessage(normalizedDomain)
          : DOMAIN_INPUT_HINT;
  const isInvalid = domainInputResult?.isErr() === true || duplicate !== null;
  const canSubmit =
    normalizedDomain !== null && duplicate === null && !isUpdating;

  const handleSubmit = async () => {
    if (!canSubmit || normalizedDomain === null) {
      return;
    }
    const success = await onSubmit(normalizedDomain);
    if (success) {
      setDomainInput("");
    }
  };

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="grow">
        <Input
          label="Domain"
          name="domain"
          placeholder="e.g. api.openai.com or *.mistral.ai"
          value={domainInput}
          message={message}
          messageStatus={isInvalid ? "error" : "info"}
          onChange={(event) => setDomainInput(event.target.value)}
          disabled={isUpdating}
        />
      </div>
      <Button
        type="submit"
        label={submitLabel}
        icon={Plus}
        disabled={!canSubmit}
        isLoading={isUpdating}
        className="mt-0 sm:mt-7"
      />
    </form>
  );
}
