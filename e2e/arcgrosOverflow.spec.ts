import { expect, test, type Frame, type Page } from "@playwright/test";

test("Arcaea B19 timestamp does not widen the 1200px canvas", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("phi-theme-studio:guide-seen:v1", "1");
    indexedDB.deleteDatabase("keyval-store");
  });
  await page.goto("/");

  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "Arcaea 风格 B19" }).click();
  await frame.locator(".song_box").first().waitFor({ state: "visible" });

  const metrics = await frame.evaluate(() => {
    const timestamp = document.querySelector<HTMLElement>(".date p:nth-of-type(2)")!;
    const rect = timestamp.getBoundingClientRect();
    return {
      body: {
        clientHeight: document.body.clientHeight,
        clientWidth: document.body.clientWidth,
        scrollWidth: document.body.scrollWidth,
      },
      html: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      timestamp: {
        clientWidth: timestamp.clientWidth,
        left: rect.left,
        overflow: getComputedStyle(timestamp).overflow,
        right: rect.right,
        scrollWidth: timestamp.scrollWidth,
      },
    };
  });

  expect(metrics.body).toEqual({
    clientHeight: 1520,
    clientWidth: 1200,
    scrollWidth: 1200,
  });
  expect(metrics.html).toEqual({ clientWidth: 1200, scrollWidth: 1200 });
  expect(metrics.timestamp).toMatchObject({ left: 891, overflow: "hidden", right: 1200 });
  expect(metrics.timestamp.scrollWidth).toBeGreaterThan(metrics.timestamp.clientWidth);
});

async function findEditorFrame(page: Page): Promise<Frame> {
  await expect.poll(async () => {
    const counts = await Promise.all(
      page.frames().map((frame) => frame.locator("[data-phi-selector]").count()),
    );
    return counts.filter((count) => count > 0).length;
  }).toBe(1);

  for (const frame of page.frames()) {
    if (await frame.locator("[data-phi-selector]").count()) return frame;
  }
  throw new Error("Editor fixture frame did not become ready");
}
