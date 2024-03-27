import { Avatar, Button, Modal, Page, Spinner2 } from "@dust-tt/sparkle";
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
  const { assistantTemplate, isAssistantTemplateLoading } =
    useAssistantTemplate({
      templateId,
      workspaceId: owner.sId,
    });

  if (!templateId) {
    return null;
  }

  if (isAssistantTemplateLoading) {
    return <Spinner2 variant="color" />;
  }

  return (
    <Modal
      title=""
      isOpen={templateId !== null}
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
    >
      <Page variant="modal">
        <div className="flex flex-col gap-5">
          <div className="flex max-h-32 max-w-lg flex-row gap-3">
            <Avatar
              emoji={assistantTemplate.emoji ?? "🫶"}
              size="lg"
              isRounded
              backgroundColor={
                assistantTemplate.backgroundColor ?? "bg-red-100"
              }
            />
            <div className="flex flex-col gap-1">
              <span className="text-bold text-lg font-medium text-element-900">
                {assistantTemplate.name}
              </span>
              <Button label="Use this Template" variant="primary" size="sm" />
            </div>
          </div>
          <p>{assistantTemplate.description}</p>
          <Page.SectionHeader title="Instructions" />
          {/* // TODO: set Limit */}
          <p>{assistantTemplate.presetInstructions}</p>
          <Page.SectionHeader title="Data Sources" />
          <p>{assistantTemplate.helpActions}</p>
        </div>
      </Page>
    </Modal>
  );
}
