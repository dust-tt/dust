// Marketing stub: the real FairUsageModal lives in front and is tied to the
// authenticated billing flow. Marketing's pricing tables only need the
// component name to render — the modal is a no-op here. Replace with a real
// implementation once the marketing site has its own usage-policy surface.
import type { ReactElement } from "react";

interface FairUsageModalProps {
  isOpened: boolean;
  onClose: () => void;
}

export function FairUsageModal({
  isOpened,
}: FairUsageModalProps): ReactElement | null {
  if (!isOpened) {
    return null;
  }
  return null;
}

export default FairUsageModal;
