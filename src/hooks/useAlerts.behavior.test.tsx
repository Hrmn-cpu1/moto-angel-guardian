import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useAlerts } from "./useAlerts";

const fake = vi.hoisted(() => ({
  rpc: vi.fn(),
  removeChannel: vi.fn(),
  listeners: [] as Array<() => void>,
  statuses: [] as Array<(status: string) => void>,
}));
vi.mock("@/lib/presence", () => ({ registrarPresenca: vi.fn(async () => {}) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: fake.rpc,
    removeChannel: fake.removeChannel,
    channel: () => {
      const channel = {
        on: (_event: string, _filter: unknown, callback: () => void) => {
          fake.listeners.push(callback);
          return channel;
        },
        subscribe: (callback: (status: string) => void) => {
          fake.statuses.push(callback);
          return channel;
        },
      };
      return channel;
    },
  },
}));
afterEach(() => {
  cleanup();
  fake.listeners.length = 0;
  fake.statuses.length = 0;
  vi.clearAllMocks();
});

function viewer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useAlerts({ lat: -23.55, lng: -46.63 }), { wrapper });
}

test("a remote insert updates two mounted viewers without a manual refresh", async () => {
  fake.rpc.mockResolvedValue({ data: [], error: null });
  const a = viewer();
  const b = viewer();
  await waitFor(() => expect(a.result.current.loading || b.result.current.loading).toBe(false));
  const report = {
    id: "new-road-report",
    type: "perigo",
    title: "Buraco na pista",
    lat: -23.55,
    lng: -46.63,
    distance_km: 0.1,
  };
  fake.rpc.mockResolvedValue({ data: [report], error: null });
  act(() => fake.listeners.forEach((callback) => callback()));
  await waitFor(() => {
    expect(a.result.current.alerts[0]?.id).toBe(report.id);
    expect(b.result.current.alerts[0]?.id).toBe(report.id);
  });
  fake.rpc.mockResolvedValue({ data: [], error: null });
  act(() => fake.listeners.forEach((callback) => callback()));
  await waitFor(() =>
    expect(a.result.current.alerts.length + b.result.current.alerts.length).toBe(0),
  );
});

test("reconnecting refreshes missed reports and connection failure removes the live claim", async () => {
  fake.rpc.mockResolvedValue({ data: [], error: null });
  const view = viewer();
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  fake.rpc.mockClear();
  act(() => fake.statuses[0]("SUBSCRIBED"));
  await waitFor(() => expect(fake.rpc).toHaveBeenCalled());
  expect(view.result.current.liveUpdates).toBe(true);
  act(() => fake.statuses[0]("CHANNEL_ERROR"));
  expect(view.result.current.liveUpdates).toBe(false);
  view.unmount();
  expect(fake.removeChannel).toHaveBeenCalledTimes(1);
});
