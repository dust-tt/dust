import { DomainBadge } from "@app/components/sandbox/DomainBadge";
import { DomainInputForm } from "@app/components/sandbox/DomainInputForm";
import {
  Button,
  Chip,
  ContentMessage,
  Trash01,
  XClose,
} from "@dust-tt/sparkle";

interface EgressDomainListEditorProps {
  allowedDomains: string[];
  // Persists the full desired list; resolves true on success (so the input
  // clears only when the add actually landed). Owns its own notifications.
  onSave: (allowedDomains: string[]) => Promise<boolean>;
  isUpdating: boolean;
  // Shown when the list is empty (scope wording differs per surface).
  emptyMessage: string;
  pendingRequests?: { domain: string }[];
  onApproveRequest?: (domain: string) => void;
  onRejectRequest?: (domain: string) => void;
  // Read-only viewers (non-admin pod members) see the domains and any pending
  // requests, but no remove/approve/reject controls.
  readOnly?: boolean;
  // When set (only meaningful with readOnly), the add input stays but submits a
  // domain request for admin review instead of writing the allowlist.
  onRequestDomain?: (domain: string) => Promise<boolean>;
}

// Add/remove editor for a sandbox egress allowlist, shared by the workspace
// Network section and the Pod network section. The input and row chrome are
// shared with the multi-Pod view (DomainInputForm, DomainBadge); surface
// chrome (headers, toggles, load/error states) stays in the caller.
export function EgressDomainListEditor({
  allowedDomains,
  onSave,
  isUpdating,
  emptyMessage,
  pendingRequests,
  onApproveRequest,
  onRejectRequest,
  readOnly = false,
  onRequestDomain,
}: EgressDomainListEditorProps) {
  // Members can't edit the allowlist, but may submit a domain request when the
  // caller provides onRequestDomain — the input stays, everything else hides.
  const isRequestMode = readOnly && onRequestDomain !== undefined;
  const showDomainInput = !readOnly || isRequestMode;

  const handleRemoveDomain = async (domain: string) => {
    await onSave(allowedDomains.filter((d) => d !== domain));
  };

  return (
    <>
      {showDomainInput && (
        <DomainInputForm
          isUpdating={isUpdating}
          submitLabel={isRequestMode ? "Request domain" : "Add domain"}
          duplicateMessage={(domain) =>
            allowedDomains.includes(domain)
              ? "This domain is already allowed."
              : isRequestMode &&
                  (pendingRequests?.some((r) => r.domain === domain) ?? false)
                ? "This domain has already been requested."
                : null
          }
          validMessage={(domain) =>
            isRequestMode
              ? `Will be requested as ${domain}.`
              : `Will be saved as ${domain}.`
          }
          onSubmit={(domain) =>
            isRequestMode && onRequestDomain
              ? onRequestDomain(domain)
              : onSave([...allowedDomains, domain])
          }
        />
      )}

      {allowedDomains.length === 0 && (pendingRequests?.length ?? 0) === 0 ? (
        <ContentMessage variant="outline" size="lg">
          {emptyMessage}
        </ContentMessage>
      ) : (
        <div className="flex w-full flex-col divide-y divide-separator">
          {pendingRequests?.map((request) => (
            <div key={request.domain} className="flex items-center gap-3 py-3">
              <DomainBadge domain={request.domain}>
                <Chip size="xs" color="warning" label="Pending approval" />
              </DomainBadge>
              {!readOnly && (
                <>
                  <Button
                    variant="highlight"
                    size="mini"
                    label="Approve"
                    tooltip={`Add ${request.domain} to the allowlist`}
                    disabled={isUpdating}
                    onClick={() => onApproveRequest?.(request.domain)}
                    className="shrink-0"
                  />
                  <Button
                    variant="ghost"
                    size="mini"
                    icon={XClose}
                    tooltip={`Reject ${request.domain}`}
                    disabled={isUpdating}
                    onClick={() => onRejectRequest?.(request.domain)}
                    className="shrink-0"
                  />
                </>
              )}
            </div>
          ))}
          {allowedDomains.map((domain) => (
            <div key={domain} className="flex items-center gap-3 py-3">
              <DomainBadge domain={domain} />
              {!readOnly && (
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
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
