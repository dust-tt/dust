import { makeScript } from "scripts/helpers";
import { QueryTypes, Sequelize } from "sequelize";

const { CONNECTORS_DATABASE_URI } = process.env;

makeScript({}, async ({ execute }) => {
  const sequelize = new Sequelize(CONNECTORS_DATABASE_URI as string, {
    logging: false,
  });

  // Select distinct connectorId on slack_messages
  const connectorIds = (
    await sequelize.query<{ connectorId: number }>(
      'SELECT DISTINCT "connectorId" FROM slack_messages',
      {
        type: QueryTypes.SELECT,
      }
    )
  ).map((c) => c.connectorId);

  for (const connectorId of connectorIds) {
    const duplicates = await sequelize.query<{
      min_id: string;
      documentId: string;
      total: number;
    }>(
      'SELECT min(id) as min_id, "documentId", count(*) as total FROM slack_messages WHERE "connectorId" = $1 GROUP BY "documentId" HAVING count(*) > 1',
      {
        type: QueryTypes.SELECT,
        bind: [connectorId],
      }
    );

    if (duplicates.length > 0) {
      console.log(
        `${duplicates.length} duplicates slack messages for connector ${connectorId}`
      );

      for (const { min_id, documentId, total } of duplicates) {
        const deleteQuery = `DELETE FROM slack_messages WHERE id > $1 AND "documentId" = $2`;
        if (execute) {
          await sequelize.query(deleteQuery, {
            bind: [Number(min_id), documentId],
            type: QueryTypes.DELETE,
          });
        } else {
          const countQuery = `SELECT count(*) as count FROM slack_messages WHERE id > $1 AND "documentId" = $2`;
          const counts = await sequelize.query<{ count: number }>(countQuery, {
            bind: [Number(min_id), documentId],
            type: QueryTypes.SELECT,
          });
          if (!counts[0]) {
            throw new Error(`No results for ${countQuery}`);
          }
          if (counts[0].count != total - 1) {
            throw new Error(
              `Expected to delete ${total - 1} but would deleted ${counts[0].count}`
            );
          } else {
            console.log(`OK: Would delete ${counts[0].count} slack messages.`);
          }
        }
      }
    }
  }
});
