import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import {
  useUpdateWorkspaceEgressPolicy,
  useWorkspaceEgressPolicy,
} from "@app/lib/swr/sandbox";
import { normalizeEgressPolicyDomain } from "@app/types/sandbox/egress_policy";
import {
  Button,
  GlobeAltIcon,
  Input,
  Page,
  PlusIcon,
  Spinner,
  TrashIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

export function EgressPolicyPage() {
  const owner = useWorkspace();
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const hasSandboxTools = featureFlags.includes("sandbox_tools");
  const [domainInput, setDomainInput] = useState("");

  const {
    policy,
    isWorkspaceEgressPolicyLoading,
    isWorkspaceEgressPolicyError,
  } = useWorkspaceEgressPolicy({
    owner,
    disabled: !hasSandboxTools || !isAdmin,
  });
  const { updateWorkspaceEgressPolicy, isUpdatingWorkspaceEgressPolicy } =
    useUpdateWorkspaceEgressPolicy({ owner });

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
          : "Use an exact domain such as api.github.com or a wildcard such as *.github.com.";
  const isDomainInputInvalid =
    domainInputResult?.isErr() === true || isDuplicate;
  const canAddDomain =
    normalizedDomain !== null &&
    !isDuplicate &&
    !isUpdatingWorkspaceEgressPolicy;

  const saveDomains = async (allowedDomains: string[]) => {
    return updateWorkspaceEgressPolicy({ allowedDomains });
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

  return (
    <Page.Vertical gap="xl" align="stretch">
      <Page.Header
        title="Network"
        icon={GlobeAltIcon}
        description="Configure workspace-level domains that sandboxes are allowed to access through the egress proxy."
      />

      {!isAdmin ? (
        <div className="rounded-xl border border-border bg-muted-background p-4 text-sm text-muted-foreground dark:border-border-night dark:bg-muted-background-night dark:text-muted-foreground-night">
          Only workspace admins can manage sandbox network settings.
        </div>
      ) : !hasSandboxTools ? (
        <div className="rounded-xl border border-border bg-muted-background p-4 text-sm text-muted-foreground dark:border-border-night dark:bg-muted-background-night dark:text-muted-foreground-night">
          Sandbox tools are not enabled for this workspace.
        </div>
      ) : isWorkspaceEgressPolicyLoading ? (
        <Spinner />
      ) : isWorkspaceEgressPolicyError ? (
        <div className="rounded-xl border border-warning-200 bg-muted-background p-4 text-sm text-warning-800 dark:border-warning-200-night dark:bg-muted-background-night dark:text-warning-800-night">
          Failed to load the sandbox network policy.
        </div>
      ) : (
        <Page.Vertical align="stretch" gap="lg">
          <div className="rounded-xl border border-border bg-muted-background p-4 dark:border-border-night dark:bg-muted-background-night">
            <div className="text-sm font-medium text-foreground dark:text-foreground-night">
              Allowed domains
            </div>
            <div className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
              These domains apply to all sandboxes in this workspace. Changes
              are picked up by egress proxy cache refreshes, typically within 60
              seconds.
            </div>

            <form
              className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start"
              onSubmit={(event) => {
                event.preventDefault();
                void handleAddDomain();
              }}
            >
              <div className="grow">
                <Input
                  label="Domain"
                  name="domain"
                  placeholder="api.github.com or *.github.com"
                  value={domainInput}
                  message={domainInputMessage}
                  messageStatus={isDomainInputInvalid ? "error" : "info"}
                  onChange={(event) => setDomainInput(event.target.value)}
                  disabled={isUpdatingWorkspaceEgressPolicy}
                />
              </div>
              <Button
                type="submit"
                label="Add domain"
                icon={PlusIcon}
                disabled={!canAddDomain}
                isLoading={isUpdatingWorkspaceEgressPolicy}
                className="mt-0 sm:mt-7"
              />
            </form>
          </div>

          {policy.allowedDomains.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground dark:border-border-night dark:text-muted-foreground-night">
              No workspace-specific domains are currently allowed.
            </div>
          ) : (
            <div className="divide-y divide-separator rounded-xl border border-border dark:divide-separator-night dark:border-border-night">
              {policy.allowedDomains.map((domain) => (
                <div key={domain} className="flex items-center gap-3 px-4 py-3">
                  <code className="rounded-lg bg-muted-background px-2 py-1 text-sm text-foreground dark:bg-muted-background-night dark:text-foreground-night">
                    {domain}
                  </code>
                  <div className="grow" />
                  <Button
                    variant="warning"
                    size="mini"
                    icon={TrashIcon}
                    tooltip={`Remove ${domain}`}
                    disabled={isUpdatingWorkspaceEgressPolicy}
                    onClick={() => {
                      void handleRemoveDomain(domain);
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </Page.Vertical>
      )}
    </Page.Vertical>
  );
}
