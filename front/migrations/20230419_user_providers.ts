import { User } from "@app/lib/models";

async function main() {
  const users = await User.findAll();

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
          if (!u.provider) {
            await u.update({
              provider: "github",
              // @ts-expect-error old migration code kept for reference
              providerId: u.githubId,
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
