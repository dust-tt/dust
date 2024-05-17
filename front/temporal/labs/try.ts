import { processTranscriptActivity,retrieveNewTranscriptsActivity } from "./activities";

const transcriptsConfigurationId = 32;

async function main() {
  const filesToProcess = await retrieveNewTranscriptsActivity(
    transcriptsConfigurationId
  );

  for (const fileId of filesToProcess) {
    console.log("Processing file:", fileId);
    await processTranscriptActivity(transcriptsConfigurationId, fileId);
  }
}

main().catch((error) => {
  console.error("An error occurred:", error);
});
