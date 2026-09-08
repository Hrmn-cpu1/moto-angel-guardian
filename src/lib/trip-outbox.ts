/** Durable, user-scoped completion queue. A retry keeps the same database id. */
export interface CompletedTrip {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  distance_measured: false;
}
type Store = Pick<Storage, "getItem" | "setItem">;
export const tripOutboxKey = (userId: string) => `moto-anjo:trip-outbox:${userId}`;

export function readTripOutbox(store: Store, userId: string): CompletedTrip[] {
  const raw = store.getItem(tripOutboxKey(userId));
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("Histórico local inválido.");
  return data.filter(
    (r): r is CompletedTrip =>
      r?.user_id === userId &&
      typeof r.id === "string" &&
      Number.isFinite(Date.parse(r.started_at)) &&
      Number.isFinite(Date.parse(r.ended_at)) &&
      Number.isInteger(r.duration_seconds),
  );
}

export function enqueueTrip(
  store: Store,
  userId: string,
  startedMs: number,
  endedMs: number,
  id: string,
): CompletedTrip {
  const rows = readTripOutbox(store, userId);
  const started_at = new Date(startedMs).toISOString();
  const existing = rows.find((r) => r.started_at === started_at);
  if (existing) return existing;
  const row: CompletedTrip = {
    id,
    user_id: userId,
    started_at,
    ended_at: new Date(endedMs).toISOString(),
    duration_seconds: Math.max(0, Math.floor((endedMs - startedMs) / 1000)),
    distance_measured: false,
  };
  store.setItem(tripOutboxKey(userId), JSON.stringify([...rows, row]));
  return row;
}

export async function flushTripOutbox(
  store: Store,
  userId: string,
  save: (row: CompletedTrip) => Promise<void>,
): Promise<void> {
  for (const row of readTripOutbox(store, userId)) {
    await save(row);
    // Re-read: another completion may have been appended while saving.
    const remaining = readTripOutbox(store, userId).filter((r) => r.id !== row.id);
    store.setItem(tripOutboxKey(userId), JSON.stringify(remaining));
  }
}
