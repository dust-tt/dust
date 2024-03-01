import { Modal } from "@dust-tt/sparkle";

export function QuickGuide({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={show}
      variant="full-screen"
      hasChanged={false}
      onClose={onClose}
      title="Quick Guide"
    >
      <>Quick Guide</>
    </Modal>
  );
}
