import { Op } from "sequelize";

import { User } from "@app/lib/models";
import { guessFirstandLastNameFromFullName } from "@app/lib/user";

async function main() {
  const users = await User.findAll({
    where: {
      firstName: {
        [Op.or]: [null, ""],
      },
    },
  });

  console.log(`Found ${users.length} users to update`);

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
          if (!u.firstName) {
            const { firstName, lastName } = guessFirstandLastNameFromFullName(
              u.name
            );
            await u.update({
              firstName,
              lastName,
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
