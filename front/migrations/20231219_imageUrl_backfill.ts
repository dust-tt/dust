import { Membership, User, UserMessage, Workspace } from "@app/lib/models";

async function main() {
  console.log("Starting imageUrl backfill");
  const workspaceIds = (
    await Workspace.findAll({
      attributes: ["id"],
    })
  ).map((a) => a.id);

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
          await backfillImageUrl(wid);
        })();
      })
    );
  }
}

async function backfillImageUrl(workspaceId: number) {
  // get all users from workspace whose imageUrl is null
  const users = await User.findAll({
    where: {
      imageUrl: null,
    },
    include: [
      {
        model: Membership,
        where: {
          workspaceId,
        },
        required: true,
      },
    ],
  });

  // for each user, find the last usermessage
  // and set the user's imageUrl to the usermessage's userContextProfilePictureUrl
  for (const user of users) {
    const userMessage = await UserMessage.findOne({
      where: {
        userId: user.id,
      },
      order: [["createdAt", "DESC"]],
    });
    if (!userMessage) {
      console.log(
        `No user messages found for user with id ${user.id} in workspace with id ${workspaceId}`
      );
      continue;
    }

    await user.update({
      imageUrl: userMessage.userContextProfilePictureUrl,
    });
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
