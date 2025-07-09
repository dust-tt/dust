import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";

import type { LightWorkspaceType, PlanType } from "@app/types";

type DocumentLimitPopupProps = {
  isOpen: boolean;
  plan: PlanType;
  onClose: () => void;
  owner: LightWorkspaceType;
};

export const DocumentLimitPopup = ({
  isOpen,
  plan,
  onClose,
  owner,
}: DocumentLimitPopupProps) => {
  const router = useRouter();
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader hideButton={false}>
          <DialogTitle>{`${plan.name} plan`}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          You have reached the limit of documents per data source (
          {plan.limits.dataSources.documents.count} documents). Upgrade your
          plan for unlimited documents and data sources.
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Check Dust plans",
            variant: "primary",
            onClick: () => {
              void router.push(`/w/${owner.sId}/subscription`);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
