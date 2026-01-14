import { Op } from "sequelize";

import { DataSourceModel } from "../lib/resources/storage/models/data_source";
import { makeScript } from "../scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  // Find all data sources with names starting with __project_context__
  const dataSources = await DataSourceModel.findAll({
    where: {
      name: {
        [Op.like]: "__project_context__%",
      },
    },
  });

  logger.info(
    { count: dataSources.length },
    `Found ${dataSources.length} data sources to rename`
  );

  for (const ds of dataSources) {
    const oldName = ds.name;
    // Replace __project_context__$ with managed-project_context_$
    const newName = oldName.replace(
      /^__project_context__(.*)$/,
      "managed-project_context_$1"
    );

    logger.info(
      {
        dataSourceId: ds.id,
        workspaceId: ds.workspaceId,
        oldName,
        newName,
        execute,
      },
      execute
        ? `Renaming data source: ${oldName} -> ${newName}`
        : `Would rename data source: ${oldName} -> ${newName}`
    );

    if (execute) {
      await ds.update({ name: newName });
      logger.info(
        { dataSourceId: ds.id, newName },
        `Successfully renamed data source`
      );
    }
  }

  logger.info({ execute }, "Migration complete");
});
