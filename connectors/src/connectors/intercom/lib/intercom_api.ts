export async function validateAccessToken(notionAccessToken: string) {
  const notionClient = new Client({ auth: notionAccessToken });
  try {
    await notionClient.search({ page_size: 1 });
  } catch (e) {
    return false;
  }
  return true;
}
