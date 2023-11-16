import { Client } from "intercom-client";

export async function validateAccessToken(notionAccessToken: string) {
  const intercomClient = new Client({
    tokenAuth: { token: notionAccessToken },
  });
  try {
    await intercomClient.admins.list(); // trying a simple request
  } catch (e) {
    return false;
  }
  return true;
}
