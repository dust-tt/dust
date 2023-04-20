import { Membership, User, Workspace } from "@app/lib/models";
import { new_id } from "@app/lib/utils";

async function main() {
  let users = await User.findAll();

  const chunks = [];
  for (let i = 0; i < users.length; i += 16) {
    chunks.push(users.slice(i, i + 16));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((u) => {
        return (async () => {
          let m = await Membership.findOne({
            where: {
              userId: u.id,
            },
          });

          if (!m) {
            let uId = new_id();

            const w = await Workspace.create({
              uId,
              sId: uId.slice(0, 10),
              name: u.username,
              type: "personal",
            });

            const m = await Membership.create({
              role: "admin",
              userId: u.id,
              workspaceId: w.id,
            });
            console.log(`+ ${u.id}`);
          } else {
            console.log(`o ${u.id}`);
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
