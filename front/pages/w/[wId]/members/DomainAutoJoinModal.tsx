import { Dialog } from "@dust-tt/sparkle";

export function DomainAutoJoinModal({
  domain,
  domainAutoJoinEnabled,
  isOpen,
  onClose,
}: {
  domain: string;
  domainAutoJoinEnabled: boolean;
  isOpen: boolean;
  onClose: (action?: "enabled" | "disabled") => void;
}) {
  const title = domainAutoJoinEnabled
    ? "De-activate Single Sign-On"
    : "Activate Single Sign-On";
  const validateLabel = domainAutoJoinEnabled ? "De-activate" : "Activate";
  const validateVariant = domainAutoJoinEnabled ? "primaryWarning" : "primary";

  return (
    <Dialog
      isOpen={isOpen}
      title={title}
      onValidate={() => onClose(domainAutoJoinEnabled ? "disabled" : "enabled")}
      onCancel={() => onClose()}
      validateLabel={validateLabel}
      validateVariant={validateVariant}
    >
      <div>
        Anyone with Google <span className="font-bold">"@{domain}"</span>{" "}
        account will have access to your Dust Workspace.
      </div>
    </Dialog>
  );
}
