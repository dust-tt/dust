import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import React, { useState } from "react";

import RootLayout from "@app/components/app/RootLayout";
import AppLayout from "@app/components/sparkle/AppLayout";
import { CreateVaultModal } from "@app/components/vaults/CreateVaultModal";
import VaultSideBarMenu from "@app/components/vaults/VaultSideBarMenu";

export interface VaultLayoutProps {
  gaTrackingId: string;
  owner: WorkspaceType;
  subscription: SubscriptionType;
}

export function VaultLayout({
  children,
  pageProps,
}: {
  children: React.ReactNode;
  pageProps: VaultLayoutProps;
}) {
  const [showVaultCreationModal, setShowVaultCreationModal] = useState(false);
  const { gaTrackingId, owner, subscription } = pageProps;

  return (
    <RootLayout>
      <AppLayout
        subscription={subscription}
        owner={owner}
        gaTrackingId={gaTrackingId}
        navChildren={
          <VaultSideBarMenu
            owner={owner}
            setShowVaultCreationModal={setShowVaultCreationModal}
          />
        }
      >
        {children}
        <CreateVaultModal
          owner={owner}
          isOpen={showVaultCreationModal}
          onClose={() => setShowVaultCreationModal(false)}
        />
      </AppLayout>
    </RootLayout>
  );
}
