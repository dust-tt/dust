// import { Op } from "sequelize";
// 
// import { sequelizeConnection } from "@connectors/resources/storage";
// import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
// 
// async function main() {
//   await ConnectorModel.update(
//     {
//       connectionId: sequelizeConnection.col("nangoConnectionId"),
//     },
//     {
//       // @ts-expect-error `connectionId` has been made non-nullable
//       where: {
//         connectionId: {
//           [Op.eq]: null,
//         },
//       },
//     }
//   );
// }
// 
// main()
//   .then(() => {
//     console.log("Done");
//     process.exit(0);
//   })
//   .catch((e) => {
//     console.error(e);
//     process.exit(1);
//   });
