import { Router } from "express";
import crypto from "crypto";

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

router.post("/login", (req, res) => {
  const { password } = req.body as { password?: string };
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) {
    return res.status(500).json({ error: "DASHBOARD_PASSWORD env var not set" });
  }

  if (!password || password !== expected) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const token = signToken(expected);
  return res.json({ token });
});

router.post("/logout", (_req, res) => {
  return res.json({ ok: true });
});

export default router;
