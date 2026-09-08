import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/useContacts", () => ({ useContacts: () => ({ contacts: [] }) }));
vi.mock("@/hooks/useGeolocation", () => ({ useGeolocation: () => ({ capture: vi.fn() }) }));
vi.mock("@/hooks/useHistory", () => ({ historyKey: ["history"] }));
vi.mock("@/lib/sos.functions", () => ({ triggerSos: vi.fn(), dispatchSosNotifications: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));
import { useSosRuntime } from "./useSosController";
const event = {
  sos_event_id: "event",
  request_id: "request",
  triggered_at: new Date().toISOString(),
  latitude: -23,
  longitude: -46,
  accuracy_m: 10,
  queued: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(cleanup);
test("refresh recovers a native event after a transient server failure", async () => {
  mocks.rpc.mockRejectedValueOnce(new Error("offline"));
  const { result } = renderHook(useSosRuntime);
  await waitFor(() => expect(result.current.recovering).toBe(false));
  expect(result.current.errorMessage).toContain("Não foi possível conferir");
  mocks.rpc.mockResolvedValueOnce({ data: [event], error: null });
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.sosEventId).toBe("event"));
  expect(result.current.open).toBe(true);
});
test("late active-event recovery cannot resurrect a successfully cancelled SOS", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: [event], error: null });
  const { result } = renderHook(useSosRuntime);
  await waitFor(() => expect(result.current.sosEventId).toBe("event"));
  let finish!: (value: unknown) => void;
  mocks.rpc.mockImplementation((name: string) =>
    name === "sos_active_event"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({ error: null }),
  );
  act(() => result.current.refresh());
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  act(() => result.current.cancel());
  await waitFor(() => expect(result.current.sosEventId).toBeNull());
  await act(async () => {
    finish({ data: [event], error: null });
  });
  expect(result.current.sosEventId).toBeNull();
  expect(result.current.open).toBe(false);
});
test("a thrown cancellation request preserves the active event and actionable error", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: [event], error: null });
  const { result } = renderHook(useSosRuntime);
  await waitFor(() => expect(result.current.sosEventId).toBe("event"));
  mocks.rpc.mockRejectedValueOnce(new Error("offline"));
  act(() => result.current.cancel());
  await waitFor(() => expect(result.current.errorMessage).toContain("não confirmou"));
  expect(result.current.sosEventId).toBe("event");
});
