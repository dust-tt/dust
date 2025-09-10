import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React from "react";

import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { Canvas } from "@app/components/canvas/Canvas";
import { CanvasProvider } from "@app/components/canvas/CanvasContext";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import type { SubscriptionType, WorkspaceType } from "@app/types";

interface CanvasPageProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
}

export default function CanvasPage({ owner, subscription }: CanvasPageProps) {
  const router = useRouter();

  return (
    <CanvasProvider>
      <AppContentLayout
        owner={owner}
        subscription={subscription}
        pageTitle="Canvas"
        hideSidebar={true}
        hasTitle={true}
      >
        <div className="flex h-full w-full flex-col bg-slate-50">
          {/* Canvas Header */}
          <div className="flex h-12 items-center justify-between border-b bg-white px-4 shadow-sm">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back
              </button>
              <h1 className="text-lg font-semibold text-gray-900">
                Canvas Workspace
              </h1>
            </div>
            <div className="text-sm text-gray-500">
              Press <kbd className="px-1 py-0.5 text-xs bg-gray-100 rounded">⌘K</kbd> to add items
            </div>
          </div>

          {/* Canvas Area */}
          <Canvas className="flex-1 relative" />
        </div>
      </AppContentLayout>
    </CanvasProvider>
  );
}

CanvasPage.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};

export const getServerSideProps: GetServerSideProps<
  CanvasPageProps
> = withDefaultUserAuthRequirements<CanvasPageProps>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription || !auth.user()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
    },
  };
});