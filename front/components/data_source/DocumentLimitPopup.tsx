import { Popup } from "@dust-tt/sparkle";
import type { LightWorkspaceType, PlanType } from "@dust-tt/types";
import { useRouter } from "next/router";

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
    <Popup
      show={isOpen}
      chipLabel={`${plan.name} plan`}
      description={`You have reached the limit of documents per data source (${plan.limits.dataSources.documents.count} documents). Upgrade your plan for unlimited documents and data sources.`}
      buttonLabel="Check Dust plans"
      buttonClick={() => {
        void router.push(`/w/${owner.sId}/subscription`);
      }}
      onClose={onClose}
      className="absolute bottom-8 right-0"
    />
  );
};
