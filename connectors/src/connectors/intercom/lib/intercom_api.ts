import { Client } from "intercom-client";

export async function validateAccessToken(intercomAccessToken: string) {
  const intercomClient = new Client({
    tokenAuth: { token: intercomAccessToken },
  });
  try {
    await intercomClient.admins.list(); // trying a simple request
  } catch (e) {
    return false;
  }
  return true;
}
