import { expect, test } from "vitest";
import { enqueueTrip, flushTripOutbox, readTripOutbox } from "./trip-outbox";

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}
test("completion survives failed save, reload and retry without changing id", async () => {
  const store = storage();
  const saved = enqueueTrip(store, "a", 1000, 12000, "id-1");
  await expect(
    flushTripOutbox(store, "a", async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow();
  expect(readTripOutbox(store, "a")).toEqual([saved]);
  expect(enqueueTrip(store, "a", 1000, 15000, "id-2").id).toBe("id-1");
  const ids: string[] = [];
  await flushTripOutbox(store, "a", async (r) => {
    ids.push(r.id);
  });
  expect(ids).toEqual(["id-1"]);
  expect(readTripOutbox(store, "a")).toEqual([]);
  expect(saved.duration_seconds).toBe(11);
  expect(saved.distance_measured).toBe(false);
});
test("one account never flushes another account's history", async () => {
  const store = storage();
  enqueueTrip(store, "a", 1000, 2000, "a1");
  const save = async () => {
    throw new Error("must not save");
  };
  await flushTripOutbox(store, "b", save);
  expect(readTripOutbox(store, "a")).toHaveLength(1);
});
