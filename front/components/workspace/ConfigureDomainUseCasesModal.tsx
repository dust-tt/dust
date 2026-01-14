import {
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useEffect, useState } from "react";

import {
  useCreateDomainUseCase,
  useDomainUseCases,
} from "@app/lib/swr/workos";
import type { LightWorkspaceType } from "@app/types";

interface ConfigureDomainUseCasesModalProps {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  domain: string;
}

export function ConfigureDomainUseCasesModal({
  isOpen,
  onClose,
  owner,
  domain,
}: ConfigureDomainUseCasesModalProps) {
  const { useCases, isUseCasesLoading, mutate } = useDomainUseCases({ owner });
  const { doCreateDomainUseCase } = useCreateDomainUseCase({ owner });

  const [ssoEnabled, setSsoEnabled] = useState(true);
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load current state when modal opens or domain changes
  useEffect(() => {
    if (isOpen && domain && !isUseCasesLoading) {
      const domainUseCases = useCases.filter(
        (uc) => uc.domain.toLowerCase() === domain.toLowerCase()
      );

      const ssoUseCase = domainUseCases.find(
        (uc) => uc.useCase === "sso_auto_join"
      );
      const mcpUseCase = domainUseCases.find(
        (uc) => uc.useCase === "mcp_static_ip_egress"
      );

      // SSO is enabled by default unless explicitly disabled
      setSsoEnabled(ssoUseCase?.status !== "disabled");
      setMcpEnabled(mcpUseCase?.status === "enabled");
      setHasChanges(false);
    }
  }, [isOpen, domain, useCases, isUseCasesLoading]);

  const handleSsoChange = () => {
    setSsoEnabled(!ssoEnabled);
    setHasChanges(true);
  };

  const handleMcpChange = () => {
    setMcpEnabled(!mcpEnabled);
    setHasChanges(true);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      // Update SSO use case
      const ssoSuccess = await doCreateDomainUseCase({
        domain,
        useCase: "sso_auto_join",
        status: ssoEnabled ? "enabled" : "disabled",
      });

      if (!ssoSuccess) {
        setIsSubmitting(false);
        return;
      }

      // Update MCP use case
      const mcpSuccess = await doCreateDomainUseCase({
        domain,
        useCase: "mcp_static_ip_egress",
        status: mcpEnabled ? "enabled" : "disabled",
      });

      if (!mcpSuccess) {
        setIsSubmitting(false);
        return;
      }

      void mutate();
      setHasChanges(false);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Configure Domain: {domain}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {isUseCasesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Select which features to enable for this verified domain.
              </p>
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="sso"
                    checked={ssoEnabled}
                    onClick={handleSsoChange}
                    disabled={isSubmitting}
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
                    onClick={handleMcpChange}
                    disabled={isSubmitting}
                  />
                  <div className="flex flex-col">
                    <Label htmlFor="mcp" className="font-normal">
                      MCP Server Whitelisting
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Connect to MCP servers on this domain through a dedicated
                      IP you can whitelist in your firewall
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
            disabled: isSubmitting,
          }}
          rightButtonProps={{
            label: isSubmitting ? "Saving..." : "Save",
            variant: "primary",
            onClick: handleSubmit,
            disabled: !hasChanges || isSubmitting,
            icon: isSubmitting ? Spinner : undefined,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
