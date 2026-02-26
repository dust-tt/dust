import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import type { WorkspaceType } from "@app/types/user";
import type { WorkspaceDomain } from "@app/types/workspace";
import {
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface MultiDomainAutoJoinModalProps {
  workspaceVerifiedDomains: WorkspaceDomain[];
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
}

export function MultiDomainAutoJoinModal({
  workspaceVerifiedDomains,
  isOpen,
  onClose,
  owner,
}: MultiDomainAutoJoinModalProps) {
  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();
  const [domainOverrides, setDomainOverrides] = useState<
    Record<string, boolean>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDomainOverrides({});
    }
  }, [isOpen]);

  const hasChanges = workspaceVerifiedDomains.some((d) => {
    const desiredValue = domainOverrides[d.domain];
    return (
      desiredValue !== undefined && desiredValue !== d.domainAutoJoinEnabled
    );
  });

  const isDomainEnabled = (domain: WorkspaceDomain): boolean =>
    domainOverrides[domain.domain] ?? domain.domainAutoJoinEnabled;

  const handleDomainToggle = (domain: WorkspaceDomain) => {
    setDomainOverrides((prev) => {
      const currentValue = prev[domain.domain] ?? domain.domainAutoJoinEnabled;
      return {
        ...prev,
        [domain.domain]: !currentValue,
      };
    });
  };

  const handleSave = async (): Promise<void> => {
    const domainUpdates = workspaceVerifiedDomains
      .filter((d) => {
        const desiredValue = domainOverrides[d.domain];
        return (
          desiredValue !== undefined && desiredValue !== d.domainAutoJoinEnabled
        );
      })
      .map((d) => ({
        domain: d.domain,
        domainAutoJoinEnabled: domainOverrides[d.domain],
      }));

    if (domainUpdates.length === 0) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await fetcherWithBody([`/api/w/${owner.sId}`, { domainUpdates }, "POST"]);

      // Full refresh to update owner object and keep formValidation logic working.
      window.location.reload();
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        sendNotification({
          type: "error",
          title: "Update failed",
          description: e.error.message,
        });
      } else {
        sendNotification({
          type: "error",
          title: "Update failed",
          description: "Failed to update auto-join settings.",
        });
      }
    } finally {
      setIsSubmitting(false);
      onClose();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Configure Auto-join</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Select which domains should allow users to automatically join your
              workspace when they sign up with a matching email address.
            </p>
            <div className="flex flex-col gap-3">
              {workspaceVerifiedDomains.map((d) => (
                <div key={d.domain} className="flex items-center gap-2">
                  <Checkbox
                    id={`domain-${d.domain}`}
                    checked={isDomainEnabled(d)}
                    onCheckedChange={() => handleDomainToggle(d)}
                    disabled={isSubmitting}
                  />
                  <Label htmlFor={`domain-${d.domain}`} className="font-normal">
                    @{d.domain}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            disabled: isSubmitting,
          }}
          rightButtonProps={{
            label: isSubmitting ? "Saving..." : "Save",
            variant: "primary",
            onClick: handleSave,
            disabled: !hasChanges || isSubmitting,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
