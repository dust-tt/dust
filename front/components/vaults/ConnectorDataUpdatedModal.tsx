import {
  Button,
  ContentMessage,
  Icon,
  Modal,
  Page,
  SparklesIcon,
} from "@dust-tt/sparkle";

type DataSourceViewSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const ConnectorDataUpdatedModal = ({
  isOpen,
  onClose,
}: DataSourceViewSelectionModalProps) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      onSave={() => {}}
      isSaving={false}
      hasChanged={false}
      variant="side-sm"
      alertModal
    >
      <Page variant="modal">
        <Page.Vertical sizing="grow">
          <div className="flex flex-col gap-2">
            <div className="p-1 text-xl font-bold">
              <Icon visual={SparklesIcon} className="text-brand" size="lg" />
              <div>Data Sync in Progress</div>
            </div>
          </div>
          <ContentMessage
            title="Data is not yet available to the workspace"
            variant="warning"
          >
            <div className="flex flex-col gap-2">
              <p>
                Once synchronized, data will appear under{" "}
                <em>"Connection Admin"</em>.
              </p>
              <p>
                Add data to <em>"Company Data"</em> for team-wide access or to a
                specific vault for <em>restricted access</em> by some team
                members.
              </p>
            </div>
          </ContentMessage>
          <div className="flex w-full justify-end">
            <Button label="Ok" onClick={() => onClose()} />
          </div>
        </Page.Vertical>
      </Page>
    </Modal>
  );
};
