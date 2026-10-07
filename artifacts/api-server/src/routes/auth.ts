import { Router } from "express";
import crypto from "crypto";
import {
  announceSetupCode,
  authMode,
  checkSetupCode,
  createPassword,
  ensureAuthLoaded,
  noteFailure,
  signingSecret,
  tooManyFailures,
  verifyPassword,
} from "../lib/dashboardAuth";

const router = Router();

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signToken(secret: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string, secret: string): boolean {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return false;

    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");

    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}

router.get("/status", async (_req, res) => {
  await ensureAuthLoaded();
  const mode = authMode();
  if (mode === "setup") announceSetupCode();
  return res.json({ mode });
});

router.post("/setup", async (req, res) => {
  await ensureAuthLoaded();
  if (authMode() !== "setup") {
    return res.status(409).json({ error: "A password is already set. Sign in instead." });
  }
  if (tooManyFailures()) {
    return res.status(429).json({ error: "Too many wrong tries. Wait a few minutes." });
  }

  const { code, password } = (req.body ?? {}) as { code?: unknown; password?: unknown };
  if (!checkSetupCode(code)) {
    noteFailure();
    announceSetupCode(true);
    return res.status(403).json({ error: "That setup code is wrong. Copy it from the server log." });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Use at least 8 characters." });
  }

  try {
    await createPassword(password);
  } catch (err) {
    return res.status(409).json({ error: (err as Error).message });
  }
  return res.json({ token: signToken(signingSecret()!) });
});

router.post("/login", async (req, res) => {
  await ensureAuthLoaded();
  if (authMode() === "setup") {
    return res.status(409).json({ error: "No password yet. Create one first." });
  }
  if (tooManyFailures()) {
    return res.status(429).json({ error: "Too many wrong tries. Wait a few minutes." });
  }

  const { password } = req.body as { password?: string };
  if (typeof password !== "string" || !password || !verifyPassword(password)) {
    noteFailure();
    return res.status(401).json({ error: "Wrong password." });
  }

  return res.json({ token: signToken(signingSecret()!) });
});

router.post("/logout", (_req, res) => {
  return res.json({ ok: true });
});

export default router;
