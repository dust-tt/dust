import type { LightWorkspaceType } from "@dust-tt/types";

import type {
  Ampli,
  AssistantBuilderStepViewedProperties,
} from "@app/lib/tracking/amplitude/client/generated";
import {
  ampli,
  AssistantBuilderOpened,
  AssistantBuilderStepViewed,
  HelpDrawerOpened,
  MultiFilesUploadUsed,
  PageViewed,
} from "@app/lib/tracking/amplitude/client/generated";
import {
  AMPLITUDE_PUBLIC_API_KEY,
  GROUP_TYPE,
} from "@app/lib/tracking/amplitude/config";

let BROWSER_CLIENT: Ampli | null = null;

function getBrowserClient() {
  if (BROWSER_CLIENT) {
    return BROWSER_CLIENT;
  }

  const disabled = !window.location.href.startsWith("https://dust.tt/");

  ampli.load({
    // The environment property is a depreacted value, but still needed by the SDK. We don't use it.
    environment: "dustprod",
    disabled: disabled,
    client: {
      apiKey: AMPLITUDE_PUBLIC_API_KEY,
      configuration: {
        defaultTracking: {
          attribution: true,
          fileDownloads: false,
          formInteractions: true,
          pageViews: false,
          sessions: true,
        },
      },
    },
  });
  BROWSER_CLIENT = ampli;

  return BROWSER_CLIENT;
}

export class AmplitudeClientSideTracking {
  static trackPageView({
    user,
    pathname,
    workspaceId,
  }: {
    user?: { id: number };
    pathname: string;
    workspaceId?: string;
  }) {
    const client = getBrowserClient();
    if (user) {
      client.identify(`user-${user.id.toString()}`);
    }
    const event = new PageViewed({
      pathname,
    });
    client.track({
      ...event,
      groups: workspaceId
        ? {
            [GROUP_TYPE]: workspaceId,
          }
        : undefined,
    });
  }

  static trackMultiFilesUploadUsed({
    fileCount,
    workspaceId,
  }: {
    fileCount: number;
    workspaceId?: string;
  }) {
    const client = getBrowserClient();
    const event = new MultiFilesUploadUsed({
      fileCount,
    });
    client.track({
      ...event,
      groups: workspaceId
        ? {
            [GROUP_TYPE]: workspaceId,
          }
        : undefined,
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
    const client = getBrowserClient();
    client.identify(`user-${user.id.toString()}`);
    client.quickGuideViewed({
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      duration,
    });
  }

  static async trackClickEnterpriseContactUs({ email }: { email: string }) {
    const client = getBrowserClient();
    client.clickedEnterpriseContactUs({
      email,
    });
    return AmplitudeClientSideTracking.flush();
  }
  static trackInputBarFileUploadUsed({ fileCount }: { fileCount: number }) {
    const client = getBrowserClient();
    client.inputBarFileUploadUsed({
      fileCount,
    });
    return AmplitudeClientSideTracking.flush();
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
    const client = getBrowserClient();
    client.fairUsageDialogViewed({
      trialing,
      workspaceId,
      workspaceName,
    });
    return AmplitudeClientSideTracking.flush();
  }

  static async flush() {
    const client = getBrowserClient();
    return client.flush().promise;
  }

  static trackAssistantBuilderOpened({
    isNew,
    assistantName,
    templateName,
    workspaceId,
  }: {
    isNew: boolean;
    templateName?: string;
    assistantName?: string;
    workspaceId: string;
  }) {
    const client = getBrowserClient();
    const event = new AssistantBuilderOpened({
      isNew,
      templateName,
      assistantName: assistantName || "",
    });
    client.track({
      ...event,
      groups: workspaceId
        ? {
            [GROUP_TYPE]: workspaceId,
          }
        : undefined,
    });

    return AmplitudeClientSideTracking.flush();
  }

  static trackAssistantBuilderStepViewed({
    step,
    isNew,
    assistantName,
    templateName,
    workspaceId,
  }: {
    step: AssistantBuilderStepViewedProperties["assistantBuilderStep"];
    isNew: boolean;
    templateName?: string;
    assistantName?: string;
    workspaceId: string;
  }) {
    const client = getBrowserClient();
    const event = new AssistantBuilderStepViewed({
      assistantBuilderStep: step,
      isNew,
      templateName,
      assistantName: assistantName || "",
    });
    client.track({
      ...event,
      groups: workspaceId
        ? {
            [GROUP_TYPE]: workspaceId,
          }
        : undefined,
    });

    return AmplitudeClientSideTracking.flush();
  }

  static trackHelpDrawerOpened({ workspaceId }: { workspaceId: string }) {
    const client = getBrowserClient();
    const event = new HelpDrawerOpened();
    client.track({
      ...event,
      groups: workspaceId
        ? {
            [GROUP_TYPE]: workspaceId,
          }
        : undefined,
    });

    return AmplitudeClientSideTracking.flush();
  }
}
