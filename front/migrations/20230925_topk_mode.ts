import { AgentRetrievalConfiguration } from "@app/lib/models";

async function main() {
  console.log("Setting topK to null for all auto topKMode configurations...");
  await AgentRetrievalConfiguration.update(
    {
      topK: null,
    },
    {
      where: {
        topKMode: "auto",
      },
    }
  );
}

main()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
