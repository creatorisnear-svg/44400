export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
}

const MAX_LOGS = 500;
const logs: LogEntry[] = [];

export function addLog(level: LogLevel, message: string, data?: unknown): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
}

export function getLogs(limit = 100): LogEntry[] {
  return logs.slice(-limit);
}

export function clearLogs(): void {
  logs.length = 0;
}

export const botLog = {
  info: (msg: string, data?: unknown) => {
    console.log(`[BOT INFO] ${msg}`, data ?? "");
    addLog("info", msg, data);
  },
  warn: (msg: string, data?: unknown) => {
    console.warn(`[BOT WARN] ${msg}`, data ?? "");
    addLog("warn", msg, data);
  },
  error: (msg: string, data?: unknown) => {
    console.error(`[BOT ERROR] ${msg}`, data ?? "");
    addLog("error", msg, data);
  },
  debug: (msg: string, data?: unknown) => {
    addLog("debug", msg, data);
  },
};
