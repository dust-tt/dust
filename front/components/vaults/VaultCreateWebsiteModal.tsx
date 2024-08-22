import { Modal } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";

export default function VaultCreateWebsiteModal({
  isOpen,
  setOpen,
  owner,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
}) {
  console.log(owner);
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setOpen(false);
      }}
      onSave={() => {
        alert("To be implemented");
        setOpen(false);
      }}
      hasChanged={true}
      variant="side-md"
      title="Create a website"
    >
      <div className="w-full pt-12">
        <div className="overflow-x-auto">To be implemented</div>
      </div>
    </Modal>
  );
}
