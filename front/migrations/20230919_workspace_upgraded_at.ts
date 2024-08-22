// import { Op } from "sequelize";
//
// import { Workspace } from "@app/lib/models/workspace";
//
// async function main() {
//   console.log("Fetching Upgraded Worspaces...");
//   // @ts-expect-error no plan column anymore
//   const workspaces = await Workspace.findAll({
//     where: {
//       // @ts-expect-error no plan column anymore
//       plan: {
//         [Op.not]: null,
//       },
//     },
//   });
//   console.log(`Found ${workspaces.length} workspaces to mark as upgraded`);
//
//   const chunkSize = 16;
//   const chunks = [];
//   for (let i = 0; i < workspaces.length; i += chunkSize) {
//     chunks.push(workspaces.slice(i, i + chunkSize));
//   }
//
//   for (let i = 0; i < chunks.length; i++) {
//     console.log(`Processing chunk ${i}/${chunks.length}...`);
//     const chunk = chunks[i];
//     await Promise.all(
//       chunk.map((workspace: Workspace) => {
//         return markWorkspaceAsUpgraded(workspace);
//       })
//     );
//   }
// }
//
// async function markWorkspaceAsUpgraded(workspace: Workspace) {
//   if (!workspace.upgradedAt) {
//     const updatedAt = workspace.updatedAt;
//     await workspace.update({
//       upgradedAt: updatedAt,
//     });
//   }
// }
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
