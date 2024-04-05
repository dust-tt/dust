import { summarizeGoogleDriveTranscriptActivity } from './activities';

const userId = 1;
const fileId = '1P00nfFjyYRKI4DeC1y-3leL7kmE72EPJPYUZGXuEVXA';

void summarizeGoogleDriveTranscriptActivity(userId, fileId).then((result) => {
  console.log(result);
});