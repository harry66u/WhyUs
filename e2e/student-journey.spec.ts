/**
 * End-to-end: one student's whole journey, against a development server
 * (see playwright.config.ts). Research runs against the live official sites,
 * so this test needs network access to the schools' pages.
 *
 *   npx playwright test
 */
import { expect, test, type Page } from "@playwright/test";

const ACTIVITIES = `1. Activity type: Environmental
Position/Leadership description and organization name: Founder and lead engineer, Creek Watch Sensor Network
Please describe this activity, including what you accomplished and any recognition you received, etc.: Built and deployed 9 solar-powered Arduino sensors measuring turbidity, temperature, and dissolved oxygen in Mill Creek; publish an open data dashboard.
Participation grade levels: 10, 11, 12
Timing of participation: All year
Hours spent per week: 6
Weeks spent per year: 40

2. Activity type: Debate/Speech
Position/Leadership description and organization name: Varsity co-captain, Lakeview High School Debate
Please describe this activity, including what you accomplished and any recognition you received, etc.: State quarterfinalist; wrote the team's energy and water policy case files.
Participation grade levels: 9, 10, 11, 12
Timing of participation: During school year
Hours spent per week: 10
Weeks spent per year: 30`;

const DRAFT =
  "Dartmouth has a world-class faculty, a beautiful campus, and a vibrant community. " +
  "I also hope to join the Hanover Underwater Robotics Lab to test my sensors in the river.";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  // Development only: with no email provider configured the link is shown on the page.
  await page.getByRole("link", { name: "Open the sign-in link" }).click();
}

test("a student researches a school without the app ever writing the essay", async ({ page, browser }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await signIn(page, email);

  // Onboarding: a student account with their own profile.
  await page.waitForURL(/\/onboarding/);
  await page.locator("label", { has: page.locator("input[name=role][value=student]") }).click();
  await page.fill("input[name=yourName]", "Jordan Reyes");
  await page.fill("input[name=highSchool]", "Lakeview High School");
  await page.getByRole("button", { name: "Create profile" }).click();

  // Profile: import a Common App activities list as text, then save.
  await page.waitForURL(/\/app\/profile/);
  if (await page.getByRole("button", { name: "Import activities" }).count()) {
    await page.getByRole("button", { name: "Import activities" }).click();
  }
  await page.locator("textarea").first().fill(ACTIVITIES);
  await page.getByRole("button", { name: "Read activities" }).click();
  await page.getByRole("button", { name: "Add 2 activities" }).click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText(/Saved/)).toBeVisible();

  // Add a school with a prompt from the library: the first school is free.
  await page.goto("/app/schools/new");
  await page.locator("label", { has: page.locator("input[name=schoolPick][value=dartmouth]") }).click();
  const unit = page.locator("label", { has: page.locator("input[name=unitPick][value=college]") });
  if (await unit.count()) await unit.click();
  await page.locator("label", { has: page.locator("input[name=promptPick]") }).first().click();
  await page.getByRole("button", { name: "Add school" }).click();

  // Live research view, then the dossier.
  await page.waitForURL(/\/research$/);
  await expect(page.getByText("Verify facts")).toBeVisible();
  await page.getByRole("link", { name: "Open dossier" }).first().click({ timeout: 150_000 });
  await page.waitForURL(/\/app\/schools\/[^/]+$/);

  // Every detail cites an official page with a verification date.
  const details = page.locator("[data-dossier-detail]");
  const count = await details.count();
  expect(count).toBeGreaterThanOrEqual(6);
  expect(count).toBeLessThanOrEqual(8);
  for (let i = 0; i < count; i++) {
    await expect(details.nth(i).getByText(/Verified [A-Z][a-z]{2} \d{1,2}, \d{4}/)).toBeVisible();
    const href = await details.nth(i).locator("a[href^='https://']").first().getAttribute("href");
    expect(href).toMatch(/dartmouth\.edu|dartmouth\.smartcatalogiq\.com/);
  }
  await expect(page.getByText(/WhyUs is a research tool/)).toBeVisible();

  // PDF export.
  const pdfHref = await page.getByRole("link", { name: /Export PDF/ }).getAttribute("href");
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  // Share link opens a read-only briefing for someone who is not signed in.
  const dossierUrl = page.url();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy share link" }).click();
  const shareUrl = await page.locator("input[readonly]").first().inputValue();
  expect(shareUrl).toMatch(/\/d\/[A-Za-z0-9_-]{16,}/);
  const anon = await browser.newContext();
  const shared = await anon.newPage();
  await shared.goto(shareUrl);
  await expect(shared.getByText(/Dartmouth/).first()).toBeVisible();
  await expect(shared.getByText(email)).toHaveCount(0);
  await anon.close();

  // Draft checker points out problems and never rewrites.
  await page.goto(dossierUrl.replace(/\/app\/schools\//, "/app/draft/"));
  await page.locator("textarea").first().fill(DRAFT);
  await page.getByRole("button", { name: /check draft/i }).click();
  await expect(page.getByText(/never rewrites your essay/i).first()).toBeVisible();
  await expect(page.getByText("Hanover Underwater Robotics Lab").first()).toBeVisible();
  await expect(page.getByText(/Could not confirm/).first()).toBeVisible();
  await expect(page.getByText(/Generic sentence/).first()).toBeVisible();

  // Delete the account and everything in it.
  await page.goto("/app/settings");
  await expect(page.getByText(email).first()).toBeVisible();
  await page.getByRole("button", { name: "Delete account" }).first().click();
  await page.locator("input[name=confirm]").fill(email);
  await page.getByRole("button", { name: "Delete account" }).last().click();
  await page.waitForURL(/\/\?deleted=1/);
  await expect(page.getByText(/were deleted/)).toBeVisible();
  await page.goto("/app");
  await page.waitForURL(/\/login/);
});
