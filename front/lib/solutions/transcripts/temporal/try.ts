// import { summarizeGoogleDriveTranscriptActivity } from './activities';
import { launchRetrieveNewTranscriptsWorkflow } from "./client";

const userId = 1;
const providerId = "google_drive";
// const fileId = '1P00nfFjyYRKI4DeC1y-3leL7kmE72EPJPYUZGXuEVXA';

void launchRetrieveNewTranscriptsWorkflow({ userId, providerId }).then(
  (result) => {
    console.log(result);
  }
);

// SUMMARIZE ACTIVITY
// void summarizeGoogleDriveTranscriptActivity(userId, fileId).then((result) => {
//   console.log(result);
// });
