import { Router } from "express";
import crypto from "crypto";

const router = Router();

export const VALID_TOKENS = new Set<string>();

router.post("/login", (req, res) => {
  const { password } = req.body as { password?: string };
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) {
    return res.status(500).json({ error: "DASHBOARD_PASSWORD env var not set" });
  }

  if (!password || password !== expected) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  VALID_TOKENS.add(token);
  return res.json({ token });
});

router.post("/logout", (req, res) => {
  const token = req.headers["x-auth-token"] as string;
  if (token) VALID_TOKENS.delete(token);
  return res.json({ ok: true });
});

export default router;
