import { DataSource } from "@app/lib/resources/storage/models/data_source";

async function main() {
  const dataSources = await DataSource.findAll();

  const chunks = [];
  for (let i = 0; i < dataSources.length; i += 16) {
    chunks.push(dataSources.slice(i, i + 16));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((ds) => {
        return (async () => {
          if (!ds.connectorProvider) {
            await ds.update({
              assistantDefaultSelected: false,
            });
          }
        })();
      })
    );
  }
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
