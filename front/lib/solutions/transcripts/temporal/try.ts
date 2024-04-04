import { retrieveNewTranscriptsActivity } from './activities';

const userId = 1;
const provider = 'google_drive';

retrieveNewTranscriptsActivity(userId, provider)
  .then(result => console.log(result))
  .catch(error => console.error(error));