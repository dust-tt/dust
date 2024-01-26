import {
  Avatar,
  Button,
  ContentMessage,
  Icon,
  LockIcon,
  Modal,
  Page,
} from "@dust-tt/sparkle";
import type { DataSourceType } from "@dust-tt/types";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";

interface DataSourceDetailsModalProps {
  dataSource: DataSourceType;
  onClick: () => void;
  onClose: () => void;
  visible: boolean;
}

export default function DataSourceDetailsModal({
  dataSource,
  onClick,
  onClose,
  visible,
}: DataSourceDetailsModalProps) {
  const { connectorProvider, editedByUser } = dataSource;
  const { editedAt, fullName, imageUrl } = editedByUser ?? {};

  if (!connectorProvider) {
    return <></>;
  }

  const { name: providerName } = CONNECTOR_CONFIGURATIONS[connectorProvider];

  return (
    <Modal
      isOpen={visible}
      title={""}
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
    >
      <Page variant="modal">
        <Page.Layout direction="vertical">
          <Page.Layout direction="horizontal" sizing="grow" gap="md">
            <Icon
              visual={CONNECTOR_CONFIGURATIONS[connectorProvider].logoComponent}
              className="align-middle"
              size="lg"
            />
            <Page.H variant="h5">
              Edit {providerName}
              's permissions
            </Page.H>
          </Page.Layout>
          <ContentMessage title="Important" variant="pink">
            <span className="font-bold">Editing</span> can break the existing
            data structure in Dust and Assistants using them. It is advise to
            use edit permission using{" "}
            <span className="font-bold">
              the same <span className="capitalize">{providerName}</span>{" "}
              Account.
            </span>
          </ContentMessage>
          {fullName && editedAt && (
            <>
              <Page.Separator />
              <Page.Layout direction="horizontal" sizing="grow" gap="md">
                <Avatar
                  name={fullName ?? undefined}
                  visual={imageUrl}
                  size="sm"
                />
                <Page.Layout direction="vertical" sizing="grow" gap="md">
                  <Page.P>
                    It was setup by the Dust user{" "}
                    <span className="font-bold">{fullName}</span> on{" "}
                    {formatTimestampToFriendlyDate(editedAt)}.
                  </Page.P>
                </Page.Layout>
              </Page.Layout>
              <Page.Separator />
            </>
          )}
          <div className="flex items-start">
            <Button
              variant="primaryWarning"
              size="sm"
              icon={LockIcon}
              label="Change Permissions"
              onClick={onClick}
              hasMagnifying={false}
            />
          </div>
        </Page.Layout>
      </Page>
    </Modal>
  );
}
