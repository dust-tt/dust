import { launchIntercomSyncWorkflow } from "@connectors/connectors/intercom/temporal/client";
import { IntercomTeamModel } from "@connectors/lib/models/intercom";

function parseArgs() {
  const args = process.argv.slice(2);
  const connectorIdIndex = args.indexOf("--connectorId");
  const asCronIndex = args.indexOf("--asCron");

  if (connectorIdIndex === -1 || connectorIdIndex === args.length - 1) {
    console.error("Error: --connectorId argument is required");
    console.error(
      "Usage: npx tsx scripts/trigger_intercom_sync.ts --connectorId <id> [--asCron]"
    );
    process.exit(1);
  }

  const connectorId = parseInt(args[connectorIdIndex + 1]!);

  if (isNaN(connectorId)) {
    console.error("Error: connectorId must be a valid number");
    process.exit(1);
  }

  const asCron = asCronIndex !== -1;

  return { connectorId, asCron };
}

async function main() {
  const { connectorId, asCron } = parseArgs();

  let teamIds: string[] | undefined;

  if (asCron) {
    console.log(
      `Triggering sync for connector ${connectorId} as cron job (all teams)`
    );
    teamIds = undefined;
  } else {
    // get teams with read permission
    const teams = await IntercomTeamModel.findAll({
      where: {
        connectorId: connectorId,
        permission: "read",
      },
    });

    teamIds = teams.map((t) => t.teamId);

    console.log(
      `Triggering sync for connector ${connectorId} with ${teamIds.length} teams`
    );
    console.log(`Team IDs: ${teamIds.join(", ")}`);
  }

  const result = await launchIntercomSyncWorkflow({
    connectorId: connectorId,
    teamIds,
    forceResync: true,
  });

  if (result.isOk()) {
    console.log(`✓ Workflow launched: ${result.value}`);
  } else {
    console.error(`✗ Failed:`, result.error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
