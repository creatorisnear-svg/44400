export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  accountId?: number | null;
}

const MAX_LOGS = 500;
const logs: LogEntry[] = [];

export function addLog(level: LogLevel, message: string, accountId?: number | null): void {
  logs.push({ timestamp: new Date().toISOString(), level, message, accountId: accountId ?? null });
  if (logs.length > MAX_LOGS) logs.shift();
}

export function getLogs(limit = 100): LogEntry[] {
  return logs.slice(-limit);
}

export const botLog = {
  info: (msg: string, accountId?: number) => { console.log(`[INFO] ${msg}`); addLog("info", msg, accountId); },
  warn: (msg: string, accountId?: number) => { console.warn(`[WARN] ${msg}`); addLog("warn", msg, accountId); },
  error: (msg: string, accountId?: number) => { console.error(`[ERR] ${msg}`); addLog("error", msg, accountId); },
  debug: (msg: string, accountId?: number) => { addLog("debug", msg, accountId); },
};
