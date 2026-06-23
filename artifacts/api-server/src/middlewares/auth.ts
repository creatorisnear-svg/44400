import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../routes/auth";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.DASHBOARD_PASSWORD;
  if (!secret) return next();

  const token = req.headers["x-auth-token"] as string | undefined;
  if (!token || !verifyToken(token, secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}
