import { frontSequelize } from "@app/lib/resources/storage";

async function main() {
  // For every membership object, we set a startAt equal to the `createdAt` field of the membership object.

  await frontSequelize.query(`
    UPDATE memberships
    SET "startAt" = memberships."createdAt"
    WHERE memberships."startAt" IS NULL;
  `);

  // For every "revoked" role membership object, we set an endAt equal to the `updatedAt` field of the membership object.
  await frontSequelize.query(`
    UPDATE memberships
    SET "endAt" = memberships."updatedAt"
    WHERE memberships."endAt" IS NULL AND memberships.role = 'revoked';
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
