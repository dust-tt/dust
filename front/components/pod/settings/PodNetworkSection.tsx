import {
  usePodEgressPolicy,
  useUpdatePodEgressPolicy,
} from "@app/lib/swr/pods";
import { normalizeEgressPolicyDomain } from "@app/types/sandbox/egress_policy";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  InfoCircle,
  Input,
  Plus,
  Spinner,
  Trash01,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface PodNetworkSectionProps {
  owner: LightWorkspaceType;
  podId: string;
}

// Pod-level sandbox egress allowlist. Merged on top of the workspace-level
// allowlist for the Pod's Shared Computer. Workspace-admin only (matching the
// API), gated behind the `sandbox_functions` feature at the call site.
export function PodNetworkSection({ owner, podId }: PodNetworkSectionProps) {
  const [domainInput, setDomainInput] = useState("");

  const { policy, isPodEgressPolicyLoading, isPodEgressPolicyError } =
    usePodEgressPolicy({ owner, podId });
  const { updatePodEgressPolicy, isUpdatingPodEgressPolicy } =
    useUpdatePodEgressPolicy({ owner, podId });

  const hasDomainInput = domainInput.trim().length > 0;
  const domainInputResult = hasDomainInput
    ? normalizeEgressPolicyDomain(domainInput)
    : null;
  const normalizedDomain =
    domainInputResult?.isOk() === true ? domainInputResult.value : null;
  const isDuplicate =
    normalizedDomain !== null &&
    policy.allowedDomains.includes(normalizedDomain);
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
  const canAddDomain =
    normalizedDomain !== null && !isDuplicate && !isUpdatingPodEgressPolicy;

  const saveDomains = async (allowedDomains: string[]) => {
    return updatePodEgressPolicy({ allowedDomains });
  };

  const handleAddDomain = async () => {
    if (!canAddDomain || normalizedDomain === null) {
      return;
    }

    const success = await saveDomains([
      ...policy.allowedDomains,
      normalizedDomain,
    ]);
    if (success) {
      setDomainInput("");
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    await saveDomains(policy.allowedDomains.filter((d) => d !== domain));
  };

  if (isPodEgressPolicyLoading) {
    return <Spinner />;
  }
  if (isPodEgressPolicyError) {
    return (
      <ContentMessage
        variant="warning"
        icon={InfoCircle}
        size="lg"
        title="Failed to load"
      >
        The Pod network settings could not be loaded.
      </ContentMessage>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="heading-lg">Network</div>
      <p className="text-sm text-muted-foreground">
        These domains apply to this Pod's Computer, in addition to the
        workspace-wide allowlist. Changes are picked up by egress proxy cache
        refreshes, typically within 60 seconds.
      </p>

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
            disabled={isUpdatingPodEgressPolicy}
          />
        </div>
        <Button
          type="submit"
          label="Add domain"
          icon={Plus}
          disabled={!canAddDomain}
          isLoading={isUpdatingPodEgressPolicy}
          className="mt-0 sm:mt-7"
        />
      </form>

      {policy.allowedDomains.length === 0 ? (
        <ContentMessage variant="outline" size="lg">
          No Pod-specific domains are currently allowed.
        </ContentMessage>
      ) : (
        <div className="flex w-full flex-col divide-y divide-separator">
          {policy.allowedDomains.map((domain) => (
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
                disabled={isUpdatingPodEgressPolicy}
                onClick={() => {
                  void handleRemoveDomain(domain);
                }}
                className="shrink-0"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
