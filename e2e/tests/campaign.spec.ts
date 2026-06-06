import { test, expect, type APIRequestContext } from "@playwright/test";

const API = process.env.E2E_API ?? "http://localhost:8000/api";

async function createCampaign(request: APIRequestContext, withContact = true) {
  const res = await request.post(`${API}/campaigns`, {
    data: {
      name: `E2E Campaign ${Date.now()}`,
      goal: "Confirm interest via an outbound call",
      reason: "End-to-end test",
      script_prompt: "You are calling {name}.",
      first_message: "Hi {name}.",
      extraction_schema: [{ key: "agreed", type: "boolean", desc: "Agreed?" }],
      voice_id: "voice_rachel",
      language: "en",
      concurrency: 2,
      retry_delay_minutes: 30,
      max_attempts: 3,
      retry_on: ["no_answer", "busy", "failed"],
      contacts: withContact
        ? [{ name: "E2E Alice", phone: "+4915112349990", context: "ctx", language: "en" }]
        : [],
    },
  });
  expect(res.ok(), `create campaign failed: ${res.status()}`).toBeTruthy();
  return res.json();
}

test("dashboard lists a campaign created via the backend", async ({ page, request }) => {
  const campaign = await createCampaign(request, false);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: campaign.name })).toBeVisible();
});

test("monitor renders real contacts and campaign from the backend", async ({ page, request }) => {
  const campaign = await createCampaign(request, true);
  await page.goto(`/campaign/${campaign.id}`);
  await expect(page.getByRole("heading", { name: campaign.name })).toBeVisible();
  await expect(page.getByText("E2E Alice")).toBeVisible();
  // contacts table reflects the one contact we created
  await expect(page.getByRole("heading", { name: /Contacts/ })).toBeVisible();
});

test("wizard step 1 is reachable", async ({ page }) => {
  await page.goto("/new");
  await expect(page.getByRole("heading", { name: "New Campaign" })).toBeVisible();
});
