import crypto from "crypto";
import { db } from "@workspace/db";
import { dashboardAuthTable } from "@workspace/db/schema";

// The dashboard password comes from one of two places:
//   "env"    DASHBOARD_PASSWORD is set (it always wins)
//   "stored" created in the browser on first visit, kept as a scrypt hash
//   "setup"  neither yet: the API stays locked until someone creates one
//            with the one-time setup code printed in the server log
export type AuthMode = "env" | "stored" | "setup";

let storedHash: string | null | undefined; // undefined = not read from the DB yet
let setupCode: string | null = null;
let lastAnnounced = 0;

export async function ensureAuthLoaded(): Promise<void> {
  if (storedHash !== undefined || process.env.DASHBOARD_PASSWORD) return;
  try {
    const [row] = await db.select().from(dashboardAuthTable).limit(1);
    storedHash = row?.passwordHash ?? null;
  } catch {
    // DB not reachable yet; try again on the next request.
  }
}

export function authMode(): AuthMode {
  if (process.env.DASHBOARD_PASSWORD) return "env";
  return storedHash ? "stored" : "setup";
}

/** Key used to sign session tokens, or null while no password exists. */
export function signingSecret(): string | null {
  const envPw = process.env.DASHBOARD_PASSWORD;
  if (envPw) return envPw;
  if (!storedHash) return null;
  return process.env.SESSION_SECRET || storedHash;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function checkHash(password: string, stored: string): boolean {
  const [kind, saltB64, hashB64] = stored.split("$");
  if (kind !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function verifyPassword(password: string): boolean {
  const envPw = process.env.DASHBOARD_PASSWORD;
  if (envPw) return safeEqual(password, envPw);
  if (storedHash) return checkHash(password, storedHash);
  return false;
}

export async function createPassword(password: string): Promise<void> {
  // Re-check the DB so a stale "setup" state can never overwrite a real password.
  const [existing] = await db.select().from(dashboardAuthTable).limit(1);
  if (existing) {
    storedHash = existing.passwordHash;
    throw new Error("A password already exists. Sign in instead.");
  }
  const hash = hashPassword(password);
  await db.insert(dashboardAuthTable).values({ passwordHash: hash });
  storedHash = hash;
  setupCode = null;
}

function getSetupCode(): string {
  if (!setupCode) {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const pick = () => alphabet[crypto.randomInt(alphabet.length)];
    const part = () => Array.from({ length: 4 }, pick).join("");
    setupCode = `${part()}-${part()}`;
  }
  return setupCode;
}

export function checkSetupCode(code: unknown): boolean {
  if (typeof code !== "string") return false;
  const cleaned = code.trim().toUpperCase().replace(/\s+/g, "");
  return safeEqual(cleaned, getSetupCode());
}

/** Prints the setup code to the server log (at most once a minute). */
export function announceSetupCode(force = false): void {
  if (authMode() !== "setup") return;
  if (!force && Date.now() - lastAnnounced < 60_000) return;
  lastAnnounced = Date.now();
  const code = getSetupCode();
  console.log(
    [
      "",
      "==============================================",
      "  Halo setup code:  " + code,
      "  Open the dashboard and enter this code to",
      "  create your password.",
      "==============================================",
      "",
    ].join("\n"),
  );
}

// Slows down password guessing: after 10 wrong tries in 5 minutes,
// every sign-in is refused until the window ends.
const failures: number[] = [];
const WINDOW_MS = 5 * 60_000;

export function tooManyFailures(): boolean {
  const cutoff = Date.now() - WINDOW_MS;
  while (failures.length && failures[0] < cutoff) failures.shift();
  return failures.length >= 10;
}

export function noteFailure(): void {
  failures.push(Date.now());
}
