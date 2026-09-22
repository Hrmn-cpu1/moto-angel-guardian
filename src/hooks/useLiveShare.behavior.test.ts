import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  read: vi.fn(),
  watch: vi.fn(),
  stop: vi.fn(),
  userId: "rider",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: mocks.userId } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }) }),
    rpc: mocks.rpc,
  },
}));
vi.mock("@/lib/geo-watch", () => ({ assinarPosicao: mocks.watch }));
vi.mock("@/lib/presence", () => ({ publicarPresenca: vi.fn() }));
import { useLiveShareRuntime } from "./useLiveShare";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.userId = "rider";
  mocks.read.mockResolvedValue({ data: { sharing: true, updated_at: null }, error: null });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.watch.mockReturnValue(mocks.stop);
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: {} });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

test("failed revocation keeps sharing active and explicitly reports the failure", async () => {
  const { result } = renderHook(() => useLiveShareRuntime());
  await waitFor(() => expect(result.current.sharing).toBe(true));
  mocks.rpc.mockResolvedValue({ error: { message: "offline" } });
  await act(() => result.current.stop());
  expect(result.current.sharing).toBe(true);
  expect(result.current.error).toContain("não confirmou");
  expect(localStorage.getItem("moto_anjo_local_share_stop_requested:rider")).toBe("1");
});

test("reconnect retries a pending stop for the same account without restarting GPS", async () => {
  const { result } = renderHook(() => useLiveShareRuntime());
  await waitFor(() => expect(result.current.sharing).toBe(true));
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  mocks.rpc.mockResolvedValue({ error: { message: "offline" } });
  await act(() => result.current.stop());
  expect(mocks.stop).toHaveBeenCalled();
  expect(result.current.localStopRequested).toBe(true);
  mocks.rpc.mockResolvedValue({ error: null });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  act(() => window.dispatchEvent(new Event("online")));
  await waitFor(() => expect(result.current.localStopRequested).toBe(false));
  expect(result.current.sharing).toBe(false);
  expect(localStorage.getItem("moto_anjo_local_share_stop_requested:rider")).toBeNull();
});

test("a saved stop reconciles on reopen and never starts the location watcher", async () => {
  localStorage.setItem("moto_anjo_local_share_stop_requested:rider", "1");
  let resolve!: (v: { error: null }) => void;
  mocks.rpc.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const { result } = renderHook(() => useLiveShareRuntime());
  await waitFor(() =>
    expect(mocks.rpc).toHaveBeenCalledWith("set_location_sharing", { _enabled: false }),
  );
  expect(mocks.watch).not.toHaveBeenCalled();
  await act(async () => resolve({ error: null }));
  await waitFor(() => expect(result.current.sharing).toBe(false));
  expect(localStorage.getItem("moto_anjo_local_share_stop_requested:rider")).toBeNull();
});

test("a pending stop from another account cannot revoke this account", async () => {
  localStorage.setItem("moto_anjo_local_share_stop_requested:rider", "1");
  mocks.userId = "other";
  const { result } = renderHook(() => useLiveShareRuntime());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.localStopRequested).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(localStorage.getItem("moto_anjo_local_share_stop_requested:rider")).toBe("1");
});

test("a legacy stop without account identity blocks GPS but is not replayed automatically", async () => {
  localStorage.setItem("moto_anjo_local_share_stop_requested", "1");
  const { result } = renderHook(() => useLiveShareRuntime());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.localStopRequested).toBe(true);
  expect(mocks.watch).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

test("start waits for server confirmation before watching or claiming transmission", async () => {
  mocks.read.mockResolvedValue({ data: null, error: null });
  let resolve!: (v: { error: null }) => void;
  mocks.rpc.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const { result } = renderHook(() => useLiveShareRuntime());
  await waitFor(() => expect(result.current.loading).toBe(false));
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.start();
  });
  expect(result.current.sharing).toBe(false);
  expect(mocks.watch).not.toHaveBeenCalled();
  await act(async () => {
    resolve({ error: null });
    await pending;
  });
  expect(result.current.sharing).toBe(true);
  expect(mocks.watch).toHaveBeenCalledOnce();
});

test("rapid toggles cannot race enable and disable requests", async () => {
  let resolve!: (v: { error: null }) => void;
  const { result } = renderHook(() => useLiveShareRuntime());
  await waitFor(() => expect(result.current.sharing).toBe(true));
  mocks.rpc.mockClear().mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.stop();
    void result.current.start();
  });
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
  await act(async () => {
    resolve({ error: null });
    await pending;
  });
  expect(result.current.sharing).toBe(false);
});

test("failed initial read remains unknown and toggle explicitly revokes", async () => {
  mocks.read.mockResolvedValue({ data: null, error: { message: "offline" } });
  const { result } = renderHook(() => useLiveShareRuntime());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.confirmed).toBe(false);
  expect(result.current.error).toBeTruthy();
  await act(() => result.current.toggle());
  expect(result.current.confirmed).toBe(true);
  expect(result.current.sharing).toBe(false);
  expect(mocks.watch).not.toHaveBeenCalled();
});

test("pending activation cannot create a location watcher after session unmount", async () => {
  mocks.read.mockResolvedValue({ data: null, error: null });
  const { result, unmount } = renderHook(() => useLiveShareRuntime());
  await waitFor(() => expect(result.current.loading).toBe(false));
  let resolve!: (v: { error: null }) => void;
  mocks.rpc.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.start();
  });
  unmount();
  await act(async () => {
    resolve({ error: null });
    await pending;
  });
  expect(mocks.watch).not.toHaveBeenCalled();
});
