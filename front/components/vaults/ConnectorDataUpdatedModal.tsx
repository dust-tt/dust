import {
  Button,
  ContentMessage,
  Hoverable,
  Icon,
  Modal,
  Page,
  SparklesIcon,
} from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import Link from "next/link";

type DataSourceViewSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
};

export const ConnectorDataUpdatedModal = ({
  isOpen,
  onClose,
  owner,
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
              <p className="font-bold">
                Add data to{" "}
                <Link
                  className="cursor-pointer font-bold text-action-500"
                  href={`/w/${owner.sId}/vaults`}
                >
                  <Hoverable onClick={() => {}}>Company Data</Hoverable>
                </Link>{" "}
                for team-wide access or to a specific vault for restricted
                access by some team members.
              </p>
            </div>
          </ContentMessage>
          <div className="w-full pt-4">
            <div className="relative w-full overflow-hidden rounded-lg pb-[56.20%]">
              <iframe
                src="https://fast.wistia.net/embed/iframe/9vf0b2rv5f?seo=true&videoFoam=false"
                title="Data Management"
                allow="autoplay; fullscreen"
                frameBorder="0"
                className="absolute left-0 top-0 h-full w-full rounded-lg"
              ></iframe>
            </div>
          </div>
          <p>
            See{" "}
            <Hoverable
              className="cursor-pointer font-bold text-action-500"
              onClick={() => {
                window.open("https://docs.dust.tt/docs/data", "_blank");
              }}
            >
              documentation
            </Hoverable>
            .
          </p>
          <div className="flex w-full justify-end">
            <Button label="Ok" onClick={() => onClose()} />
          </div>
        </Page.Vertical>
      </Page>
    </Modal>
  );
};
