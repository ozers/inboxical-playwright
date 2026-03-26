import { Inboxical } from "@inboxical/sdk";
import type {
  Inbox,
  Message,
  InboxicalOptions,
  ExtractCodeOptions,
} from "@inboxical/sdk";

export type { Inbox, Message, InboxicalOptions, ExtractCodeOptions };
export { InboxicalApiError, InboxicalNetworkError } from "@inboxical/sdk";

export interface InboxicalMailboxOptions {
  /** Inboxical API key. Defaults to INBOXICAL_API_KEY env var. */
  apiKey?: string;
  /** Base URL override. */
  baseUrl?: string;
}

/**
 * High-level helper for managing a single test inbox in Playwright tests.
 *
 * Designed to work cleanly with Playwright test fixtures or standalone usage.
 *
 * @example
 * ```ts
 * import { test, expect } from "@playwright/test";
 * import { InboxicalMailbox } from "@inboxical/playwright";
 *
 * test("user can verify email", async ({ page }) => {
 *   const mailbox = new InboxicalMailbox();
 *   const { email } = await mailbox.create({ name: "signup-test" });
 *
 *   await page.goto("/signup");
 *   await page.fill("#email", email);
 *   await page.click("button[type=submit]");
 *
 *   const message = await mailbox.waitForMessage({ timeout: 30 });
 *   expect(message.subject).toContain("Verify");
 *
 *   const code = await mailbox.extractCode();
 *   await page.fill("#verification-code", code);
 *   await page.click("#verify-button");
 *
 *   await expect(page.locator(".success")).toBeVisible();
 *   await mailbox.cleanup();
 * });
 * ```
 */
export class InboxicalMailbox {
  private readonly client: Inboxical;
  private inboxId: string | null = null;
  private inboxEmail: string | null = null;
  private lastMessage: Message | null = null;

  constructor(options?: InboxicalMailboxOptions) {
    const apiKey = options?.apiKey || process.env.INBOXICAL_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Inboxical API key is required. Set INBOXICAL_API_KEY env var or pass apiKey in options.",
      );
    }
    this.client = new Inboxical({ apiKey, baseUrl: options?.baseUrl });
  }

  /** Get the underlying Inboxical SDK client for advanced usage. */
  getClient(): Inboxical {
    return this.client;
  }

  /** Get the current inbox ID, or null if no inbox has been created. */
  getInboxId(): string | null {
    return this.inboxId;
  }

  /** Get the current inbox email address, or null if no inbox has been created. */
  getEmail(): string | null {
    return this.inboxEmail;
  }

  /**
   * Create a new test inbox.
   * If an inbox was previously created, it is deleted first.
   */
  async create(options?: {
    name?: string;
    domain?: string;
  }): Promise<{ id: string; email: string }> {
    if (this.inboxId) {
      await this.cleanup();
    }

    const inbox = await this.client.createInbox(options);
    this.inboxId = inbox.id;
    this.inboxEmail = inbox.email_address;
    this.lastMessage = null;

    return { id: inbox.id, email: inbox.email_address };
  }

  /**
   * Wait for a message to arrive in the inbox.
   * Uses the API's long-polling endpoint.
   *
   * @returns The received message.
   * @throws If no inbox has been created.
   */
  async waitForMessage(options?: {
    timeout?: number;
    since?: string;
  }): Promise<Message> {
    this.assertInbox();
    const message = await this.client.waitForMessage(this.inboxId!, options);
    this.lastMessage = message;
    return message;
  }

  /** Get all messages in the current inbox. */
  async getMessages(): Promise<Message[]> {
    this.assertInbox();
    const result = await this.client.getMessages(this.inboxId!);
    return result.messages;
  }

  /** Get the latest message in the current inbox. */
  async getLatestMessage(): Promise<Message> {
    this.assertInbox();
    const message = await this.client.getLatestMessage(this.inboxId!);
    this.lastMessage = message;
    return message;
  }

  /**
   * Extract an OTP / verification code from the latest message.
   *
   * If no message has been fetched yet, fetches the latest one first.
   *
   * @returns The extracted code string.
   * @throws If no code can be found.
   */
  async extractCode(options?: { pattern?: RegExp }): Promise<string> {
    if (!this.lastMessage) {
      await this.getLatestMessage();
    }
    const code = this.client.extractCode(this.lastMessage!, options);
    if (!code) {
      throw new Error(
        "No verification code found in message. " +
          `Subject: "${this.lastMessage!.subject}". ` +
          "Try providing a custom pattern via options.pattern.",
      );
    }
    return code;
  }

  /**
   * Delete the current inbox and all its messages.
   * Safe to call multiple times.
   */
  async cleanup(): Promise<void> {
    if (this.inboxId) {
      try {
        await this.client.deleteInbox(this.inboxId);
      } catch {
        // Ignore errors during cleanup (inbox may already be expired/deleted).
      }
      this.inboxId = null;
      this.inboxEmail = null;
      this.lastMessage = null;
    }
  }

  private assertInbox(): void {
    if (!this.inboxId) {
      throw new Error(
        "No inbox created yet. Call mailbox.create() before this method.",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Playwright Test Fixture Helper
// ---------------------------------------------------------------------------

/**
 * Creates a Playwright test fixture for Inboxical mailbox.
 *
 * @example
 * ```ts
 * // fixtures.ts
 * import { test as base } from "@playwright/test";
 * import { createMailboxFixture } from "@inboxical/playwright";
 *
 * export const test = base.extend<{ mailbox: InboxicalMailbox }>({
 *   mailbox: createMailboxFixture(),
 * });
 *
 * // my-test.spec.ts
 * import { test } from "./fixtures";
 *
 * test("email flow", async ({ page, mailbox }) => {
 *   const { email } = await mailbox.create();
 *   // ...
 * });
 * ```
 */
export function createMailboxFixture(
  options?: InboxicalMailboxOptions,
): [
  // Playwright expects a tuple: [worker-scoped factory, { scope }] or just the factory fn
  (
    context: Record<string, unknown>,
    use: (mailbox: InboxicalMailbox) => Promise<void>,
  ) => Promise<void>,
  { scope: "test" },
] {
  const factory = async (
    _context: Record<string, unknown>,
    use: (mailbox: InboxicalMailbox) => Promise<void>,
  ) => {
    const mailbox = new InboxicalMailbox(options);
    await use(mailbox);
    await mailbox.cleanup();
  };

  return [factory, { scope: "test" }];
}
