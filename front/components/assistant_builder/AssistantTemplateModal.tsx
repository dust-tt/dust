import { Modal } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";

import { useAssistantTemplate } from "@app/lib/swr";

interface AssistantTemplateModalProps {
  onClose: () => void;
  owner: WorkspaceType;
  templateId: string | null;
}

export function AssistantTemplateModal({
  onClose,
  owner,
  templateId,
}: AssistantTemplateModalProps) {
  const { assistantTemplate } = useAssistantTemplate({
    templateId,
    workspaceId: owner.sId,
  });

  return (
    <Modal
      title=""
      isOpen={templateId !== null}
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
    >
      <div className="flex flex-col gap-5 pt-6 text-sm text-element-700">
        {assistantTemplate?.description}
      </div>
    </Modal>
  );
}
