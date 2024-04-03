import { frontSequelize } from "@app/lib/resources/storage";

async function main() {
  // We no longer rely on the "revoked" role for memberships.
  await frontSequelize.query(`
    UPDATE memberships
    SET "role" = 'member'
    WHERE role = 'revoked';
  `);
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
