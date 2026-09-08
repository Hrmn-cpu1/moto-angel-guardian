import { expect, test, vi } from "vitest";
import { enqueueTrip, readTripOutbox } from "./trip-outbox";
const mocks = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "rider" } } }) },
    from: () => ({ upsert: mocks.upsert }),
  },
}));
import { syncCompletedTrips } from "./trip-history-sync";

test("sync drains a trip added while the previous upload is pending", async () => {
  localStorage.clear();
  enqueueTrip(localStorage, "rider", 1000, 61000, "first");
  let release!: (v: { error: null }) => void;
  mocks.upsert
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        }),
    )
    .mockResolvedValue({ error: null });
  const first = syncCompletedTrips();
  await vi.waitFor(() => expect(mocks.upsert).toHaveBeenCalledOnce());
  enqueueTrip(localStorage, "rider", 70000, 130000, "second");
  const second = syncCompletedTrips();
  release({ error: null });
  await Promise.all([first, second]);
  expect(mocks.upsert).toHaveBeenCalledTimes(2);
  expect(readTripOutbox(localStorage, "rider")).toEqual([]);
});
