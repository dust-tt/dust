import { normalizeEgressPolicyDomain } from "@app/types/sandbox/egress_policy";
import { Button, ContentMessage, Input, Plus, Trash01 } from "@dust-tt/sparkle";
import { useState } from "react";

interface EgressDomainListEditorProps {
  allowedDomains: string[];
  // Persists the full desired list; resolves true on success (so the input
  // clears only when the add actually landed). Owns its own notifications.
  onSave: (allowedDomains: string[]) => Promise<boolean>;
  isUpdating: boolean;
  // Shown when the list is empty (scope wording differs per surface).
  emptyMessage: string;
}

// Add/remove editor for a sandbox egress allowlist, shared by the workspace
// Network section and the Pod network section. Domain validation, dedupe, and
// the input + list rendering live here; surface-specific chrome (headers,
// toggles, load/error states) stays in the caller.
export function EgressDomainListEditor({
  allowedDomains,
  onSave,
  isUpdating,
  emptyMessage,
}: EgressDomainListEditorProps) {
  const [domainInput, setDomainInput] = useState("");

  const hasDomainInput = domainInput.trim().length > 0;
  const domainInputResult = hasDomainInput
    ? normalizeEgressPolicyDomain(domainInput)
    : null;
  const normalizedDomain =
    domainInputResult?.isOk() === true ? domainInputResult.value : null;
  const isDuplicate =
    normalizedDomain !== null && allowedDomains.includes(normalizedDomain);
  const domainInputMessage =
    domainInputResult?.isErr() === true
      ? domainInputResult.error.message
      : isDuplicate
        ? "This domain is already allowed."
        : normalizedDomain
          ? `Will be saved as ${normalizedDomain}.`
          : "Use an exact domain such as api.openai.com or a wildcard such as *.mistral.ai.";
  const isDomainInputInvalid =
    domainInputResult?.isErr() === true || isDuplicate;
  const canAddDomain = normalizedDomain !== null && !isDuplicate && !isUpdating;

  const handleAddDomain = async () => {
    if (!canAddDomain || normalizedDomain === null) {
      return;
    }

    const success = await onSave([...allowedDomains, normalizedDomain]);
    if (success) {
      setDomainInput("");
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    await onSave(allowedDomains.filter((d) => d !== domain));
  };

  return (
    <>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
        onSubmit={(event) => {
          event.preventDefault();
          void handleAddDomain();
        }}
      >
        <div className="grow">
          <Input
            label="Domain"
            name="domain"
            placeholder="e.g. api.openai.com or *.mistral.ai"
            value={domainInput}
            message={domainInputMessage}
            messageStatus={isDomainInputInvalid ? "error" : "info"}
            onChange={(event) => setDomainInput(event.target.value)}
            disabled={isUpdating}
          />
        </div>
        <Button
          type="submit"
          label="Add domain"
          icon={Plus}
          disabled={!canAddDomain}
          isLoading={isUpdating}
          className="mt-0 sm:mt-7"
        />
      </form>

      {allowedDomains.length === 0 ? (
        <ContentMessage variant="outline" size="lg">
          {emptyMessage}
        </ContentMessage>
      ) : (
        <div className="flex w-full flex-col divide-y divide-separator">
          {allowedDomains.map((domain) => (
            <div key={domain} className="flex items-center gap-3 py-3">
              <pre
                title={domain}
                className="min-w-0 grow overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2 text-sm text-foreground"
              >
                {domain}
              </pre>
              <Button
                variant="warning"
                size="mini"
                icon={Trash01}
                tooltip={`Remove ${domain}`}
                disabled={isUpdating}
                onClick={() => {
                  void handleRemoveDomain(domain);
                }}
                className="shrink-0"
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
