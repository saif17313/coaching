export type LogLevel = "info" | "warn" | "error" | "security";
export type LogContext = Record<string, unknown>;

export function log(level: LogLevel, message: string, context?: LogContext): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
  }));
}
