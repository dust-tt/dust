import { Subscription } from "@app/lib/models";

const { LIVE = false, WORKSPACE_IDS = "" } = process.env;

async function main() {
  console.log(`Running in live mode: ${LIVE} - workspaceIds: ${WORKSPACE_IDS}`);

  // Got this script from running the following query on the database:
  // SELECT "workspaceId", COUNT(*) as "subscriptionsCount"
  // FROM "workspaces" WHERE "plan" = '5'
  //GROUP BY "workspaceId" HAVING COUNT(*) > 1;
  const workspacesIds = getWorkspaceIds();

  for (const workspaceId of workspacesIds) {
    await getValidSubscriptionStartDateForWorkspace(workspaceId);
    await deletedDuplicatedEndedSubscriptionsForWorkspace(workspaceId);
  }
}

const getWorkspaceIds = (): number[] => {
  const workspaceIds = WORKSPACE_IDS;
  return workspaceIds ? workspaceIds.split(",").map(Number) : [];
};

const getValidSubscriptionStartDateForWorkspace = async (
  workspaceId: number
) => {
  console.log(`Fixing subscription start date for workspace ${workspaceId}`);
  const subscriptions = await Subscription.findAll({
    where: {
      workspaceId: workspaceId,
      planId: 5,
    },
    order: [["startDate", "ASC"]],
  });
  console.log(`    Found ${subscriptions.length} subscriptions`);
  const firstStartDate = subscriptions[0].startDate;
  subscriptions.forEach(async (subscription) => {
    if (subscription.status === "active") {
      console.log(
        `    Update ${subscription.id} start date to ${firstStartDate}`
      );
      if (LIVE === "true") {
        await subscription.update({
          startDate: firstStartDate,
        });
      }
    }
  });
};

const deletedDuplicatedEndedSubscriptionsForWorkspace = async (
  workspaceId: number
) => {
  console.log(`Cleaning duplicated ended subscriptions for ${workspaceId}`);
  const subscriptions = await Subscription.findAll({
    where: {
      workspaceId: workspaceId,
      status: "ended",
      planId: 5,
    },
  });
  console.log(`    Found ${subscriptions.length} subscriptions`);
  for (const subscription of subscriptions) {
    console.log(`    Deleting ended subscription ${subscription.id}`);
    if (LIVE === "true") {
      await subscription.destroy();
    }
  }
};

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
