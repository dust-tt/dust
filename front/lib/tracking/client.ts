import type { LightWorkspaceType } from "@dust-tt/types";

import { AmplitudeClientSideTracking } from "@app/lib/tracking/amplitude/client";

export class ClientSideTracking {
  static trackPageView({
    user,
    pathname,
    workspaceId,
  }: {
    user?: { id: number };
    pathname: string;
    workspaceId?: string;
  }) {
    return AmplitudeClientSideTracking.trackPageView({
      user,
      pathname,
      workspaceId,
    });
  }

  static trackMultiFilesUploadUsed({
    fileCount,
    workspaceId,
  }: {
    fileCount: number;
    workspaceId?: string;
  }) {
    return AmplitudeClientSideTracking.trackMultiFilesUploadUsed({
      fileCount,
      workspaceId,
    });
  }

  static trackQuickGuideViewed({
    user,
    workspace,
    duration,
  }: {
    user: { id: number };
    workspace: LightWorkspaceType;
    duration: number;
  }) {
    return AmplitudeClientSideTracking.trackQuickGuideViewed({
      user,
      workspace,
      duration,
    });
  }

  static trackClickEnterpriseContactUs({ email }: { email: string }) {
    return AmplitudeClientSideTracking.trackClickEnterpriseContactUs({
      email,
    });
  }

  static trackFairUsageDialogViewed({
    trialing,
    workspaceId,
    workspaceName,
  }: {
    trialing: boolean;
    workspaceId: string;
    workspaceName: string;
  }) {
    return AmplitudeClientSideTracking.trackFairUsageDialogViewed({
      trialing,
      workspaceId,
      workspaceName,
    });
  }
}
