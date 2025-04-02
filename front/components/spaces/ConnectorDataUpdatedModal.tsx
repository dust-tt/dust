import {
  Button,
  ContentMessage,
  Hoverable,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SparklesIcon,
} from "@dust-tt/sparkle";

import { REMOTE_DATABASE_CONNECTOR_PROVIDERS } from "@app/lib/connector_providers";
import type { ConnectorProvider } from "@app/types";

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
  const isRemoteDbProvider =
    REMOTE_DATABASE_CONNECTOR_PROVIDERS.includes(connectorProvider);

  return (
    <Sheet open={isOpen}>
      <SheetContent
        size="lg"
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
      >
        <SheetHeader hideButton>
          <SheetTitle icon={SparklesIcon}>Data sync in progress...</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <ContentMessage variant="amber">
            <div className="flex flex-col gap-2">
              <p>
                Once synchronized, {isRemoteDbProvider ? "table" : "data"} will
                appear under <em>"Connection Admin"</em> and can be added to:
              </p>
              <ul className="ml-6 list-disc">
                <li>
                  An <strong>Open Space</strong> for company-wide access
                </li>
                <li>
                  A <strong>Restricted Space</strong> for custom access
                </li>
              </ul>
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
              variant="highlight"
              onClick={() => {
                window.open("https://docs.dust.tt/docs/data", "_blank");
              }}
            >
              documentation
            </Hoverable>{" "}
            for more information.
          </p>
          <div className="flex w-full justify-end">
            <Button label="Ok" onClick={() => onClose()} />
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
};
