# @inboxical/playwright

[Inboxical](https://inboxical.com) helper for [Playwright](https://playwright.dev/) — test email flows in your E2E tests.

## Install

```bash
npm install @inboxical/playwright @inboxical/sdk
```

## Quick Start

```ts
import { test, expect } from "@playwright/test";
import { InboxicalMailbox } from "@inboxical/playwright";

test("user can verify email", async ({ page }) => {
  const mailbox = new InboxicalMailbox();
  const { email } = await mailbox.create({ name: "signup-test" });

  await page.goto("/signup");
  await page.fill("#email", email);
  await page.click("button[type=submit]");

  const message = await mailbox.waitForMessage({ timeout: 30 });
  expect(message.subject).toContain("Verify");

  const code = await mailbox.extractCode();
  await page.fill("#verification-code", code);
  await page.click("#verify-button");

  await expect(page.locator(".success")).toBeVisible();
  await mailbox.cleanup();
});
```

## Playwright Fixture

For cleaner test setup, use the built-in fixture helper:

```ts
// fixtures.ts
import { test as base } from "@playwright/test";
import { InboxicalMailbox, createMailboxFixture } from "@inboxical/playwright";

export const test = base.extend<{ mailbox: InboxicalMailbox }>({
  mailbox: createMailboxFixture(),
});

// my-test.spec.ts
import { test } from "./fixtures";
import { expect } from "@playwright/test";

test("email flow", async ({ page, mailbox }) => {
  const { email } = await mailbox.create();

  await page.goto("/signup");
  await page.fill("#email", email);
  await page.click("button[type=submit]");

  const message = await mailbox.waitForMessage({ timeout: 30 });
  const code = await mailbox.extractCode();

  await page.fill("#code", code);
  await page.click("#submit");
  await expect(page.locator(".welcome")).toBeVisible();
  // cleanup is automatic via the fixture
});
```

## API

### `InboxicalMailbox`

| Method | Description |
|--------|-------------|
| `create(options?)` | Create a new test inbox |
| `waitForMessage(options?)` | Wait for a message (long-poll) |
| `getMessages()` | Get all messages |
| `getLatestMessage()` | Get the latest message |
| `extractCode(options?)` | Extract OTP/verification code |
| `cleanup()` | Delete inbox and messages |
| `getClient()` | Access underlying SDK client |
| `getInboxId()` | Get current inbox ID |
| `getEmail()` | Get current inbox email |

### `createMailboxFixture(options?)`

Returns a Playwright test fixture that auto-creates and auto-cleans an `InboxicalMailbox`.

## Related

- [`@inboxical/sdk`](https://github.com/ozers/inboxical-sdk) — Core Node.js SDK
- [`@inboxical/cypress`](https://github.com/ozers/inboxical-cypress) — Cypress plugin

## License

MIT
