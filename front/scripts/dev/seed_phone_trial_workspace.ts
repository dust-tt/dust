import { createAndLogMembership } from "@app/lib/api/signup";
import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { FREE_TRIAL_PHONE_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error("❌ This script can only be run in development mode.");
    console.error("   Set NODE_ENV=development and try again.");
    process.exit(1);
  }

  const testEmail = "test-phone-trial@dust.tt";
  const workspaceName = "Phone Trial Test";

  console.log("🔍 Looking for or creating test user...");

  // Find or create the test user
  let user = await UserResource.fetchByEmail(testEmail);

  if (!user) {
    user = await UserResource.makeNew({
      sId: generateRandomModelSId(),
      provider: "google",
      providerId: `test-phone-trial-${Date.now()}`,
      workOSUserId: null,
      email: testEmail,
      username: "test-phone-trial",
      name: "Phone Trial Test User",
      firstName: "Test",
      lastName: "User",
      lastLoginAt: null,
    });
    console.log(`✅ Created test user: ${user.email} (sId: ${user.sId})`);
  } else {
    console.log(`✅ Found existing user: ${user.email} (sId: ${user.sId})`);
  }

  // Create workspace with phone trial plan
  console.log("🔍 Creating test workspace with phone trial plan...");

  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 15); // 15 day trial

  const workspace = await createWorkspaceInternal({
    name: workspaceName,
    isBusiness: false,
    planCode: FREE_TRIAL_PHONE_PLAN_CODE,
    endDate: trialEndDate,
  });

  console.log(`✅ Created workspace: ${workspace.name} (sId: ${workspace.sId})`);
  console.log(`   Plan: ${FREE_TRIAL_PHONE_PLAN_CODE}`);
  console.log(`   Trial ends: ${trialEndDate.toISOString()}`);

  // Enable the phone_trial_paywall feature flag
  console.log("🔍 Enabling phone_trial_paywall feature flag...");

  const existingFlag = await FeatureFlagModel.findOne({
    where: {
      workspaceId: workspace.id,
      name: "phone_trial_paywall",
    },
  });

  if (!existingFlag) {
    await FeatureFlagModel.create({
      workspaceId: workspace.id,
      name: "phone_trial_paywall",
    });
    console.log("✅ Enabled phone_trial_paywall feature flag");
  } else {
    console.log("✅ Feature flag already enabled");
  }

  // Add user as admin member
  console.log("🔍 Adding user as admin member...");

  await createAndLogMembership({
    user,
    workspace,
    role: "admin",
    origin: "invited",
  });

  console.log("✅ Added user as admin member");

  console.log("\n" + "=".repeat(60));
  console.log("🎉 Phone Trial Test Workspace is ready!");
  console.log("=".repeat(60));
  console.log(`\n📧 Login email: ${testEmail}`);
  console.log(`🏢 Workspace: ${workspace.name} (sId: ${workspace.sId})`);
  console.log(`🔗 Agent Builder: http://localhost:12000/w/${workspace.sId}/builder/agents/new`);
  console.log(`\n💡 To login:`);
  console.log(`   1. Go to http://localhost:12000`);
  console.log(`   2. Use the dev login flow`);
  console.log(`   3. Enter email: ${testEmail}`);
  console.log("=".repeat(60) + "\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
