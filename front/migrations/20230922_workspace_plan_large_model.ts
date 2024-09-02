// import { Op } from "sequelize";
//
// import { Workspace } from "@app/lib/models/workspace";
//
// //import { planForWorkspace } from "@app/lib/auth";
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
//     //     return addLargeModelTrue(workspace);
//     //   })
//     // );
//   }
// }
//
// // async function addLargeModelTrue(workspace: Workspace) {
// //   const plan = planForWorkspace(workspace);
// //   plan.limits.largeModels = true;
// //   await workspace.update({
// //     plan: JSON.stringify(plan),
// //   });
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
