import {
  Button,
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { useCreateDomainUseCase } from "@app/lib/swr/workos";
import type { LightWorkspaceType } from "@app/types";

interface AddDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  addDomainLink?: string;
}

export function AddDomainModal({
  isOpen,
  onClose,
  owner,
  addDomainLink,
}: AddDomainModalProps) {
  const [domain, setDomain] = useState("");
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { doCreateDomainUseCase } = useCreateDomainUseCase({ owner });

  const handleSubmit = async () => {
    if (!domain.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Create pending use case entries for selected options
      if (mcpEnabled) {
        const success = await doCreateDomainUseCase({
          domain: domain.trim().toLowerCase(),
          useCase: "mcp_static_ip_egress",
          status: "pending",
        });

        if (!success) {
          setIsSubmitting(false);
          return;
        }
      }

      // Redirect to WorkOS to complete domain verification
      if (addDomainLink) {
        window.open(addDomainLink, "_blank");
      }

      // Reset form and close modal
      setDomain("");
      setMcpEnabled(false);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setDomain("");
    setMcpEnabled(false);
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add Domain</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="domain">Domain name</Label>
              <Input
                id="domain"
                placeholder="example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-sm text-muted-foreground">
                Enter the domain you want to verify. You'll complete the DNS
                verification in the next step.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label>What will this domain be used for?</Label>
              <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="sso"
                    checked={true}
                    disabled={true}
                  />
                  <div className="flex flex-col">
                    <Label htmlFor="sso" className="font-normal">
                      Single Sign-On (SSO)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Enable SSO and allow users to auto-join with their work
                      email
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="mcp"
                    checked={mcpEnabled}
                    onClick={() => setMcpEnabled(!mcpEnabled)}
                    disabled={isSubmitting}
                  />
                  <div className="flex flex-col">
                    <Label htmlFor="mcp" className="font-normal">
                      MCP Server Whitelisting
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Allow MCP servers on this domain to use our static IP for
                      firewall whitelisting
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleClose,
            disabled: isSubmitting,
          }}
          rightButtonProps={{
            label: isSubmitting ? "Adding..." : "Continue to Verification",
            variant: "primary",
            onClick: handleSubmit,
            disabled: !domain.trim() || isSubmitting,
            icon: isSubmitting ? Spinner : undefined,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
