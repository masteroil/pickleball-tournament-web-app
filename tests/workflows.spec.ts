import { test, expect, type Page } from "@playwright/test";
async function signIn(page: Page, role: string) {
  await page.getByRole("button", { name: "Staff sign in" }).click();
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Referee desk" }),
  ).toBeVisible();
}
test("phone referee syncs with a separate spectator, goes offline and reconnects", async ({
  page,
  browser,
  baseURL,
}) => {
  const spectator = await browser.newContext({ baseURL });
  const board = await spectator.newPage();
  await board.goto("/#match/demo/mixed/P5");
  await page.goto("/");
  await signIn(page, "referee");
  await page.goto("/#match/demo/mixed/P5");
  const score = Number(await board.getByTestId("score-0").textContent());
  await page.getByRole("button", { name: /^\+1 / }).first().click();
  await expect(board.getByTestId("score-0")).toHaveText(String(score + 1));
  await expect(page.getByTestId("score-0")).toHaveText(String(score + 1));
  await page.context().setOffline(true);
  await expect(
    page.getByRole("button", { name: /^\+1 / }).first(),
  ).toBeDisabled();
  await expect(page.getByTestId("score-0")).toHaveText(String(score + 1));
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Undo last action" }).click();
  await expect(board.getByTestId("score-0")).toHaveText(String(score));
  await expect(board.getByRole("button", { name: /^\+1 / })).toHaveCount(0);
  await spectator.close();
});
test("organizer creates eight entries, generates twelve matches and assigns a referee", async ({
  page,
}) => {
  await page.goto("/");
  await signIn(page, "admin");
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await page
    .getByLabel("Tournament name", { exact: true })
    .fill("Acceptance Open");
  await page.getByLabel("Organizer", { exact: true }).fill("Tournament desk");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Entry name")).toHaveCount(8);
  await page
    .locator("form")
    .getByRole("button", { name: "Create tournament" })
    .click();
  await page.getByRole("button", { name: "Generate schedule" }).click();
  await expect(
    page.getByText(/8 entries · 2 pools · 12 matches/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Assign", exact: true }),
  ).toHaveCount(12);
  await page
    .getByRole("button", { name: "Assign", exact: true })
    .first()
    .click();
  await page.getByLabel("Referee UID").fill("referee");
  await page.getByRole("button", { name: "Save assignment" }).click();
  await expect(page.getByLabel("Referee UID")).toHaveCount(0);
});

test("referee confirms a result and the desk corrects it with an audit trail", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/");
  await signIn(page, "referee");
  await page.goto("/#match/demo/mixed/P5");
  const point = page.getByRole("button", { name: /^\+1 / }).first();
  for (let target = 9; target <= 15; target++) {
    await point.click();
    await expect(page.getByTestId("score-0")).toHaveText(String(target));
  }
  await page.getByRole("button", { name: "Review final result" }).click();
  await page.getByRole("button", { name: "Confirm final result" }).click();
  await expect(page.getByText("Winner · Bacuit Breakers")).toBeVisible();
  const desk = await browser.newContext({ baseURL });
  const admin = await desk.newPage();
  await admin.goto("/");
  await signIn(admin, "admin");
  await admin.goto("/#match/demo/mixed/P5");
  admin.once("dialog", (dialog) => dialog.accept("Signed score sheet"));
  await admin.getByRole("button", { name: "Reopen result" }).click();
  await admin.getByText("Correct game scores", { exact: true }).click();
  await admin.getByLabel("Games, e.g.").fill("6-15");
  await admin
    .getByLabel("Reason for correction")
    .fill("Verified winner on score sheet");
  await admin.getByRole("button", { name: "Save correction" }).click();
  await expect(admin.getByTestId("score-1")).toHaveText("15");
  await admin.getByRole("button", { name: "Review corrected result" }).click();
  await admin.getByRole("button", { name: "Confirm final result" }).click();
  await expect(page.getByText("Winner · Corong Aces")).toBeVisible();
  await admin.getByText(/^Score history \(/).click();
  await expect(
    admin.getByText(/Verified winner on score sheet/).last(),
  ).toBeVisible();
  await desk.close();
});
