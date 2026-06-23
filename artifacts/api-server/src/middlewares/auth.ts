import type { Request, Response, NextFunction } from "express";
import { VALID_TOKENS } from "../routes/auth";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!process.env.DASHBOARD_PASSWORD) return next();

  const token = req.headers["x-auth-token"] as string | undefined;
  if (!token || !VALID_TOKENS.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}
