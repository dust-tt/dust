import type { LightWorkspaceType } from "@dust-tt/types";

import type { BuilderScreen } from "@app/components/assistant_builder/types";
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

  static trackInputBarFileUploadUsed({ fileCount }: { fileCount: number }) {
    return AmplitudeClientSideTracking.trackInputBarFileUploadUsed({
      fileCount,
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

  static trackAssistantBuilderOpened({
    isNew,
    assistantName,
    templateName,
    workspaceId,
  }: {
    isNew: boolean;
    assistantName?: string;
    templateName?: string;
    workspaceId: string;
  }) {
    return AmplitudeClientSideTracking.trackAssistantBuilderOpened({
      isNew,
      templateName,
      assistantName,
      workspaceId,
    });
  }

  static trackAssistantBuilderStepViewed({
    step,
    isNew,
    assistantName,
    templateName,
    workspaceId,
  }: {
    step: BuilderScreen;
    isNew: boolean;
    templateName?: string;
    assistantName?: string;
    workspaceId: string;
  }) {
    return AmplitudeClientSideTracking.trackAssistantBuilderStepViewed({
      step,
      isNew,
      assistantName,
      templateName,
      workspaceId,
    });
  }

  static trackHelpDrawerOpened({
    workspaceId,
  }: {
    workspaceId: string;
  }) {
    return AmplitudeClientSideTracking.trackHelpDrawerOpened({
      workspaceId,
    });
  }
}
