// import { QdrantClient } from "@qdrant/js-client-rest";
//
// const { QDRANT_API_KEY, QDRANT_URL } = process.env;
//
// const COLLECTION_NAMES = [
//   {
//     name: "ds_17b52af2b585f321b5c9daa0114a91d2ffa3e7d12811a74b4005d6a5e700e152", // 4d76593070 google-drive
//   },
//   {
//     name: "ds_31a617b7b5c9409d088aca2b7b629e6d11777406b92abe3bcb229dbaad6711ca", // 2ddbc0204d notion
//   },
// ];
//
// const BUGGY_COLLECTION_NAMES = [
//   "ds_997287f2cd8355b2854558e9fc2fc5a5b0c3d91f5a4d1e7f1bacf2c3cf26a05d",
//   "ds_05574642c532c40134e17d408058b1f80ad9e68e45e489d5e9bb23e553aee568",
// ];
//
// const client = new QdrantClient({
//   url: QDRANT_URL,
//   apiKey: QDRANT_API_KEY,
// });
//
// async function inspect() {
//   for (const c of BUGGY_COLLECTION_NAMES) {
//     const result = await client.getCollection(c);
//     console.log(result);
//   }
// }
//
// async function cleanup() {
//   const collections = COLLECTION_NAMES;
//   console.log(`Cleaning up ${collections.length} collections.`);
//   let i = 0;
//   for (const c of collections) {
//     let done = 0;
//     let offset:
//       | number
//       | undefined
//       | null
//       | string
//       | Record<string, unknown> = 0;
//     while (offset !== null && offset !== undefined) {
//       const res = await client.scroll(c.name, {
//         filter: {
//           must: [
//             {
//               is_empty: {
//                 key: "document_id_hash",
//               },
//             },
//           ],
//         },
//         with_payload: true,
//         limit: 1024,
//         offset,
//       });
//
//       const points = res.points.map((p) => p.id);
//       const r = await client.delete(c.name, { wait: true, points });
//       console.log(`Deleted ${points.length} points from ${c.name} res=${r}`);
//
//       offset = res.next_page_offset;
//       done += res.points.length;
//     }
//
//     const rr = await client.getCollection(c.name);
//     console.log("DONE");
//     console.log(rr);
//   }
// }
//
// async function run() {
//   const result = await client.getCollections();
//   // const collections = result.collections;
//   const collections = COLLECTION_NAMES;
//
//   console.log(`Processing ${collections.length} collections.`);
//   let i = 0;
//   for (const c of collections) {
//     if (BUGGY_COLLECTION_NAMES.includes(c.name)) {
//       console.log(`SKIPPING ${c.name}`);
//       continue;
//     }
//     let done = 0;
//     let offset:
//       | number
//       | undefined
//       | null
//       | string
//       | Record<string, unknown> = 0;
//     while (offset !== null && offset !== undefined) {
//       const res = await client.scroll(c.name, {
//         filter: {
//           must: [
//             {
//               is_empty: {
//                 key: "document_id_hash",
//               },
//             },
//           ],
//         },
//         with_payload: true,
//         limit: 1024,
//         offset,
//       });
//
//       offset = res.next_page_offset;
//       done += res.points.length;
//     }
//     if (done > 0) {
//       console.log(`NULL_FOUND [${c.name}] found=${done}`);
//     }
//     i++;
//     if (i % 32 === 0) {
//       console.log(`PROCESS [${i}/${collections.length}] sleeping 1s`);
//       await new Promise((resolve) => setTimeout(resolve, 1000));
//     }
//   }
// }
//
// void (async () => {
//   await run();
//   // await inspect();
//   // await cleanup();
// })();
