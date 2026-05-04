import { test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authFile = path.join(__dirname, ".auth/user.json");

setup("authenticate", async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto("/api/workos/login?returnTo=/api/login");
  await page.pause();
  await page.context().storageState({ path: authFile });
});
