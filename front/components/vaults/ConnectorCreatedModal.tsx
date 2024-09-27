import { Icon, Modal, Page, SparklesIcon } from "@dust-tt/sparkle";
import type {
  ConnectorStatusDetails,
  DataSourceType,
  LightWorkspaceType,
} from "@dust-tt/types";

import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";

type DataSourceViewSelectionModalProps = {
  dataSource: DataSourceType & ConnectorStatusDetails;
  isOpen: boolean;
  onClose: (shouldRefresh: boolean) => void;
  owner: LightWorkspaceType;
};

export const ConnectorCreatedModal = ({
  isOpen,
  onClose,
  dataSource,
  owner,
}: DataSourceViewSelectionModalProps) => {
  // const [showVaultCreationModal, setShowVaultCreationModal] = useState(false);
  // const [defaultVault, setDefaultVault] = useState<VaultType | null>(null);

  return (
    <Modal
      title={`Select data sources`}
      isOpen={isOpen}
      onClose={() => onClose(false)}
      onSave={() => {}}
      saveLabel="Save"
      savingLabel="Saving..."
      isSaving={false}
      hasChanged={false}
      variant="side-sm"
    >
      <Page variant="modal">
        <Page.Vertical sizing="grow">
          <div className="flex flex-col gap-2">
            <div className="p-1 text-xl font-bold">
              <Icon visual={SparklesIcon} className={"text-brand"} size="lg" />
              <div>Data added.</div>
              <div>Data Sync underway.</div>
            </div>
            {dataSource.connector && (
              <ConnectorSyncingChip
                initialState={dataSource.connector}
                workspaceId={owner.sId}
                dataSource={dataSource}
              />
            )}
          </div>
          <ul className="list-disc pl-4 text-sm text-element-900">
            <li className="py-1">
              New data will appear in <em>"Connection Management"</em> as it
              syncs.
            </li>
            <li>
              Data Access is limited to{" "}
              <strong className="font-semibold">Admins</strong> by default.
              Share with your team through <em>"Company Data"</em> or restricted{" "}
              <em>"Vaults"</em>.
            </li>
          </ul>
          {/* <>
              <div className="flex w-full flex-col gap-2 border-t pb-4 pt-4">
                <Page.SectionHeader title="Data access settings" />
                <div className="flex items-center gap-2">
                  By default, the access to the data is restricted. Make the
                  data available in:
                </div>
                <VaultSelector
                  key={defaultVault?.sId}
                  asAdmin
                  owner={owner}
                  defaultVault={defaultVault?.sId}
                  renderChildren={(vault) => <div>{vault?.name}</div>}
                />
              </div>
              <Button
                className="mt-4"
                size="xs"
                variant="tertiary"
                label="Create a new Vault"
                icon={PlusIcon}
                onClick={() => setShowVaultCreationModal(true)}
              />
            </> */}
        </Page.Vertical>
      </Page>
      {/* <CreateOrEditVaultModal
        owner={owner}
        isOpen={showVaultCreationModal}
        onClose={() => setShowVaultCreationModal(false)}
        onCreated={(created) => setDefaultVault(created)}
        isAdmin={true}
      /> */}
    </Modal>
  );
};
