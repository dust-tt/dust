import { REMOTE_DATABASE_CONNECTOR_PROVIDERS } from "@app/lib/connector_providers";
import type { ConnectorProvider } from "@app/types/data_source";
import {
  Button,
  ContentMessage,
  Hoverable,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Stars02,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

type DataSourceViewSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  connectorProvider: ConnectorProvider;
};

export const ConnectorDataUpdatedModal = ({
  isOpen,
  onClose,
  connectorProvider,
}: DataSourceViewSelectionModalProps) => {
  const { t } = useLingui();
  const isRemoteDbProvider =
    REMOTE_DATABASE_CONNECTOR_PROVIDERS.includes(connectorProvider);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        size="lg"
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle icon={Stars02}>
            <Trans>Data sync in progress...</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <ContentMessage>
            <div className="flex flex-col gap-2">
              <p>
                {isRemoteDbProvider ? (
                  <Trans>
                    Once synchronized, table will appear under{" "}
                    <em>"Connection Admin"</em> and can be added to:
                  </Trans>
                ) : (
                  <Trans>
                    Once synchronized, data will appear under{" "}
                    <em>"Connection Admin"</em> and can be added to:
                  </Trans>
                )}
              </p>
              <ul className="ml-6 list-disc">
                <li>
                  <Trans>
                    An <strong>Open Space</strong> for company-wide access
                  </Trans>
                </li>
                <li>
                  <Trans>
                    A <strong>Restricted Space</strong> for custom access
                  </Trans>
                </li>
              </ul>
            </div>
          </ContentMessage>
          <div className="w-full pt-4">
            <div className="relative w-full overflow-hidden rounded-lg pb-[56.20%]">
              <iframe
                src="https://fast.wistia.net/embed/iframe/9vf0b2rv5f?seo=true&videoFoam=false"
                title={t`Data management`}
                allow="autoplay; fullscreen"
                frameBorder="0"
                className="absolute left-0 top-0 h-full w-full rounded-lg"
              ></iframe>
            </div>
          </div>
          <p>
            <Trans>
              See{" "}
              <Hoverable
                variant="highlight"
                onClick={() => {
                  window.open("https://docs.dust.tt/docs/data", "_blank");
                }}
              >
                documentation
              </Hoverable>{" "}
              for more information.
            </Trans>
          </p>
          <div className="flex w-full justify-end">
            <Button label={t`Ok`} onClick={() => onClose()} />
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
};
