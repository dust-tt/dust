import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { formatValue } from "@app/temporal/relocation/sql_generator";

async function main() {
  // return getTablesWithWorkspaceIdOrder();

  const [a] = await frontSequelize.query(
    "SELECT * FROM datasets WHERE id = 2",
    {
      type: QueryTypes.SELECT,
    }
  );

  console.log(">> formatValue:", JSON.stringify(formatValue(a), null, 2));
}

main()
  .then(() => console.log("Done"))
  .catch(console.error);
