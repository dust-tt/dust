import { retrieveNewTranscriptsActivity } from './activities';

const transcriptsConfigurationId = 29;

async function main() {
    await retrieveNewTranscriptsActivity(transcriptsConfigurationId);
}

main().catch(error => {
    console.error("An error occurred:", error);
});