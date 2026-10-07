import { useAppRouter } from "@app/lib/platform";
import type { PlanType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { Plural, Trans, useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
  const router = useAppRouter();
  const planName = plan.name;
  const documentCount = plan.limits.dataSources.documents.count;
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader hideButton={false}>
          <DialogTitle>{t`${planName} plan`}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Trans>
            You have reached the limit of documents per data source (
            <Plural
              value={documentCount}
              one="# document"
              other="# documents"
            />
            ). Upgrade your plan for unlimited documents and data sources.
          </Trans>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: t`Check Dust plans`,
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
