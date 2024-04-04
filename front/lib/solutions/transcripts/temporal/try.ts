import { launchRetrieveNewTranscriptsWorkflow } from './client';

const userId = 1;
const providerId = 'google_drive';

void launchRetrieveNewTranscriptsWorkflow({userId, providerId}).then((result) => {
  console.log(result);
});