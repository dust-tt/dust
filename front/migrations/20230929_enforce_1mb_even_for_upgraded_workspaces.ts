// import { Op } from "sequelize";
//
// import { Workspace } from "@app/lib/models/workspace";
//
// // import { planForWorkspace } from "@app/lib/auth";
//
// // const { LIVE = false } = process.env;
//
// async function main() {
//   console.log("Fetching Upgraded Worspaces...");
//   const workspaces = await Workspace.findAll({
//     where: {
//       upgradedAt: {
//         [Op.not]: null,
//       },
//     },
//   });
//   console.log(
//     `Found ${workspaces.length} workspaces for which to add largeModels = true`
//   );
//
//   const chunkSize = 16;
//   const chunks = [];
//   for (let i = 0; i < workspaces.length; i += chunkSize) {
//     chunks.push(workspaces.slice(i, i + chunkSize));
//   }
//
//   for (let i = 0; i < chunks.length; i++) {
//     console.log(`Processing chunk ${i}/${chunks.length}...`);
//     // const chunk = chunks[i];
//     // await Promise.all(
//     //   chunk.map((workspace: Workspace) => {
//     //     return set1MBLimit(!!LIVE, workspace);
//     //   })
//     // );
//   }
// }
//
// // async function set1MBLimit(live: boolean, workspace: Workspace) {
// //   const plan = planForWorkspace(workspace);
// //   plan.limits.dataSources.documents.sizeMb = 2;
// //   if (live) {
// //     await workspace.update({
// //       plan: JSON.stringify(plan),
// //     });
// //   } else {
// //     console.log(`Would have mutated ${workspace.sId}`);
// //   }
// // }
//
// main()
//   .then(() => {
//     console.log("done");
//     process.exit(0);
//   })
//   .catch((err) => {
//     console.error(err);
//     process.exit(1);
//   });
