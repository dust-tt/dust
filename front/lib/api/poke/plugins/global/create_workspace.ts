import { handleMembershipInvitations } from "@app/lib/api/invitation";
import { createPlugin } from "@app/lib/api/poke/types";
import { config } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { Plan } from "@app/lib/models/plan";
import { isFreePlan } from "@app/lib/plans/plan_codes";
import { getRegionDisplay } from "@app/lib/poke/regions";
import { isEmailValid } from "@app/lib/utils";
import { Err, Ok } from "@app/types";

export const createWorkspacePlugin = createPlugin({
  manifest: {
    id: "create-workspace",
    name: "Create Workspace",
    description: `Create a new workspace in ${getRegionDisplay(config.getCurrentRegion())}.`,
    resourceTypes: ["global"],
    args: {
      name: {
        type: "string",
        label: "Name",
        description: "The name of the workspace",
      },
      email: {
        type: "string",
        label: "Email",
        description: "The email of the admin user",
      },
      isBusiness: {
        type: "boolean",
        label: "Whitelist workspace for Enterprise seat based plan",
        description:
          "Workspace will subscribe to Enterprise seat based plan (45€/$/£) when doing their Stripe checkout session.",
      },
      planCode: {
        type: "enum",
        label: "Plan Code (optional)",
        description:
          "Code of the plan to subscribe the workspace to. Select a free plan or leave empty to redirect to the paywall for the Pro plan.",
        values: [],
        async: true,
        multiple: false,
      },
      endDate: {
        type: "string",
        label: "End Date (optional)",
        description:
          "End date of the subscription, format: YYYY-MM-DD. Leave empty for no end date. If an end date is set, the workspace will automatically downgraded the day after the end date.",
        required: false,
      },
    },
  },
  populateAsyncArgs: async () => {
    // Fetch all plans from the database
    const plans = await Plan.findAll({ order: [["name", "ASC"]] });

    // Create enum values with "None" as the first option
    const planValues = [
      {
        label: "None (redirect to Pro plan paywall)",
        value: "",
      },
      ...plans
        .filter((plan) => isFreePlan(plan.code))
        .map((plan) => ({
          label: `${plan.name} (${plan.code})`,
          value: plan.code,
        })),
    ];

    return new Ok({
      planCode: planValues,
    });
  },
  execute: async (auth, _, args) => {
    const email = args.email.trim();
    if (isEmailValid(email) === false) {
      return new Err(new Error("Email address is invalid."));
    }

    const name = args.name.trim();
    if (name.length === 0) {
      return new Err(new Error("Name is required."));
    }

    // Extract the selected plan code from the enum array (empty string means no plan)
    const selectedPlanCode = args.planCode[0] || "";
    const planCode = selectedPlanCode === "" ? null : selectedPlanCode;

    const workspace = await createWorkspaceInternal({
      name,
      isBusiness: args.isBusiness,
      planCode,
      endDate: args.endDate ? new Date(args.endDate) : null,
    });

    const newWorkspaceAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const subscription = newWorkspaceAuth.subscription();
    if (!subscription) {
      return new Err(new Error("The workspace does not have a subscription."));
    }

    const invitationRes = await handleMembershipInvitations(newWorkspaceAuth, {
      owner: newWorkspaceAuth.getNonNullableWorkspace(),
      // Dust admin user who invited the new user.
      user: auth.getNonNullableUser().toJSON(),
      subscription,
      invitationRequests: [
        {
          email,
          role: "admin",
        },
      ],
    });

    if (invitationRes.isErr()) {
      return new Err(new Error(invitationRes.error.api_error.message));
    }

    const [result] = invitationRes.value;
    if (!result.success) {
      return new Err(new Error(result.error_message));
    }

    let message = `Workspace created (id: ${workspace.sId}) and invitation sent to ${result.email}.`;

    if (planCode) {
      message += `\nPlan: ${planCode}`;
      if (args.endDate) {
        message += ` (expires: ${args.endDate})`;
      }
    }

    return new Ok({
      display: "textWithLink",
      value: message,
      link: `poke/${workspace.sId}`,
      linkText: "View Workspace",
    });
  },
});
