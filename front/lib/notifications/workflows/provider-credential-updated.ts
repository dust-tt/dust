import { ProviderCredentialsHealthUpdatedPayloadSchema } from "@app/lib/notifications/triggers/provider-credential-updated";
import {
  PROVIDER_CREDENTIALS_HEALTH_UPDATED_TAG,
  PROVIDER_CREDENTIALS_HEALTH_UPDATED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { workflow } from "@novu/framework";

export const providerCredentialsHealthUpdatedWorkflow = workflow(
  PROVIDER_CREDENTIALS_HEALTH_UPDATED_TRIGGER_ID,
  async ({ step, payload }) => {
    await step.inApp("provider-credentials-health-updated-in-app", async () => {
      return {
        subject: "Provider credentials health updated",
        body: payload.workspaceId,
        data: {
          autoDelete: true,
          mutateAuthContext: true,
          workspaceId: payload.workspaceId,
        },
      };
    });
  },
  {
    payloadSchema: ProviderCredentialsHealthUpdatedPayloadSchema,
    tags: [PROVIDER_CREDENTIALS_HEALTH_UPDATED_TAG],
  }
);
