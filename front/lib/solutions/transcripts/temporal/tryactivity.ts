import { summarizeGoogleDriveTranscriptActivity } from "./activities";

const userId = 1;
const fileId = "1P00nfFjyYRKI4DeC1y-3leL7kmE72EPJPYUZGXuEVXA";
// Fat docto transcript
// const fileId = '1DRhE89QjotRjKBth6PBCdE-ZDM46XMe8eO1Nx0aJNYc';

void summarizeGoogleDriveTranscriptActivity(userId, fileId).then((result) => {
  console.log(result);
});
