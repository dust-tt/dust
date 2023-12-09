import { AgentConfiguration, Membership, User } from "@app/lib/models";

async function main() {
  console.log("Starting author backfill");
  const workspaceIds = (
    await AgentConfiguration.findAll({
      attributes: ["workspaceId"],
      group: ["workspaceId"],
    })
  ).map((a) => a.workspaceId);

  console.log(`Found ${workspaceIds.length} workspaces to update`);
  const chunks = [];
  for (let i = 0; i < workspaceIds.length; i += 16) {
    chunks.push(workspaceIds.slice(i, i + 16));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing workspace chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];

    await Promise.all(
      chunk.map((wid: number) => {
        return (async () => {
          await backfillAuthor(wid);
        })();
      })
    );
  }
}

async function backfillAuthor(workspaceId: number) {
  // set author as the first admin of the workspace
  const author = await User.findOne({
    include: [
      {
        model: Membership,
        where: {
          role: "admin",
          workspaceId,
        },
      },
    ],
    order: [["createdAt", "ASC"]],
  });
  if (!author) {
    console.log(`No author found for workspace with id ${workspaceId}`);
    return;
  }

  // update all agent configurations with null author of this workspace
  const agentConfigurations = await AgentConfiguration.update(
    {
      authorId: author.id,
    },
    {
      // @ts-expect-error null is not tolerated by sequelize after migration
      where: {
        workspaceId,
        authorId: null,
      },
    }
  );
  console.log(
    `Updated ${agentConfigurations[0]} agent configurations for workspace ${workspaceId}`
  );
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
