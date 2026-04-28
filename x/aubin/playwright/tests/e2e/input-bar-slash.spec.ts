import { expect, test } from "@playwright/test";

test("opens the slash dropdown from the input bar", async ({ page }) => {
  await page.goto("/");

  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  await editor.fill("/");

  await expect(page.getByText("Loading capabilities…")).toBeVisible();
});
