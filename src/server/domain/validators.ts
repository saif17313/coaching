/** These validators run on untrusted input. Final business invariants live in PostgreSQL. */
export type BatchInput = Readonly<{ code: string; name: string; capacity: number; startsOn?: string | null; endsOn?: string | null }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseUuid(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value)) throw new Error("INVALID_UUID");
  return value;
}
export function parseBatchInput(value: unknown): BatchInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_BATCH");
  const x = value as Record<string, unknown>;
  const code = x.code, name = x.name, capacity = x.capacity;
  if (typeof code !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(code)) throw new Error("INVALID_BATCH_CODE");
  if (typeof name !== "string" || !name.trim() || name.trim().length > 160) throw new Error("INVALID_BATCH_NAME");
  if (typeof capacity !== "number" || !Number.isSafeInteger(capacity) || capacity <= 0) throw new Error("INVALID_CAPACITY");
  const date = (v: unknown) => v === null || v === undefined ? null : typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) ? v : (() => {throw new Error("INVALID_DATE");})();
  const startsOn = date(x.startsOn), endsOn = date(x.endsOn);
  if (startsOn && endsOn && startsOn > endsOn) throw new Error("INVALID_DATE_RANGE");
  return {code, name: name.trim(), capacity, startsOn, endsOn};
}
