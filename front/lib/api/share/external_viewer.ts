import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { PlanType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";

type FromVerifiedEmailInput = {
  email: string;
};

/**
 * @cc [owner:achilleburah,label:security;architecture] not-an-authenticator
 * ExternalViewer MUST NOT extend Authenticator, MUST NOT be assignable to or from it, and MUST NOT
 * expose a role other than `none`, groups or permission checks.
 */
export class ExternalViewer {
  private constructor(
    private readonly _workspace: LightWorkspaceType,
    private readonly _plan: PlanType,
    private readonly _viewerEmail: string
  ) {}

  /**
   * @cc [owner:achilleburah,label:security] email-verified-for-workspace
   * `email` MUST be the email of a valid frame session for `workspace`. Nothing else from the
   * request MAY supply it.
   */
  static async fromVerifiedEmail(
    workspace: WorkspaceResource,
    { email }: FromVerifiedEmailInput
  ): Promise<ExternalViewer> {
    const subscription =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);

    return new ExternalViewer(
      renderLightWorkspaceType({ workspace }),
      subscription.getPlan(),
      email
    );
  }

  workspace(): LightWorkspaceType {
    return this._workspace;
  }

  plan(): PlanType {
    return this._plan;
  }

  viewerEmail(): string {
    return this._viewerEmail;
  }
}
