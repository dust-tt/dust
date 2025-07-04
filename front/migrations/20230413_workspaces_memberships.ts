import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";

async function main() {
  const users = await UserModel.findAll();

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
          const m = await MembershipModel.findOne({
            where: {
              userId: u.id,
            },
          });

          if (!m) {
            // @ts-expect-error new_id deprecated after #5755
            const uId = new_id();

            const w = await WorkspaceModel.create({
              sId: uId.slice(0, 10),
              name: u.username,
              //@ts-expect-error old migration code kept for reference
              type: "personal",
            });

            await MembershipModel.create({
              role: "admin",
              userId: u.id,
              workspaceId: w.id,
              startAt: new Date(),
              origin: "invited",
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
