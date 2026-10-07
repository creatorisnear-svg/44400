import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../routes/auth";
import { ensureAuthLoaded, signingSecret } from "../lib/dashboardAuth";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  await ensureAuthLoaded();
  const secret = signingSecret();
  // No password yet: stay locked (the API hands out Discord tokens' power).
  if (!secret) return res.status(401).json({ error: "Create a dashboard password first." });

  const token = req.headers["x-auth-token"] as string | undefined;
  if (!token || !verifyToken(token, secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}
