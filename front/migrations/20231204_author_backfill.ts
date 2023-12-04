import {
  AgentConfiguration,
  Membership,
  User,
  Workspace,
} from "@app/lib/models";

async function main() {
  const workspaces = await Workspace.findAll();

  console.log(`Found ${workspaces.length} users to update`);
  for (const w of workspaces) {
    await backfillAuthor(w);
  }
}

async function backfillAuthor(workspace: Workspace) {
  // get all agent configurations in the workspace
  const agentConfigurations = await AgentConfiguration.findAll({
    where: { workspaceId: workspace.id },
  });

  // set author as the first admin of the workspace
  const author = await User.findOne({
    include: [
      {
        model: Membership,
        as: "memberships", // replace with the actual alias if defined
        where: {
          role: "admin",
          workspaceId: workspace.id, // replace with the actual workspace ID
        },
      },
    ],
    order: [["createdAt", "ASC"]],
  });
  if (!author) {
    console.log(`No author found for workspace ${workspace.id}`);
    return;
  }
  const chunks = [];
  for (let i = 0; i < agentConfigurations.length; i += 16) {
    chunks.push(agentConfigurations.slice(i, i + 16));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];

    await Promise.all(
      chunk.map((a: AgentConfiguration) => {
        return (async () => {
          if (!a.authorId) {
            await a.update({
              authorId: author.id,
            });
          }
        })();
      })
    );
  }
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
