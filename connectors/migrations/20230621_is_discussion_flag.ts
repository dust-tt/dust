import { Op } from "sequelize";

import { GithubIssue } from "@connectors/lib/models";

async function main() {
  await GithubIssue.update(
    {
      isDiscussion: false,
    },
    {
      where: {
        isDiscussion: {
          [Op.eq]: null,
        },
      },
    }
  );
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
