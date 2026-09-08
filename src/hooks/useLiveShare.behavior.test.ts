import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), read: vi.fn(), watch: vi.fn(), stop: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "rider" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }) }),
    rpc: mocks.rpc,
  },
}));
vi.mock("@/lib/geo-watch", () => ({ assinarPosicao: mocks.watch }));
vi.mock("@/lib/presence", () => ({ publicarPresenca: vi.fn() }));
import { useLiveShareRuntime } from "./useLiveShare";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ data: { sharing: true, updated_at: null }, error: null });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.watch.mockReturnValue(mocks.stop);
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: {} });
});

test("failed revocation keeps sharing active and explicitly reports the failure", async () => {
  const { result } = renderHook(() => useLiveShareRuntime());
  await waitFor(() => expect(result.current.sharing).toBe(true));
  mocks.rpc.mockResolvedValue({ error: { message: "offline" } });
  await act(() => result.current.stop());
  expect(result.current.sharing).toBe(true);
  expect(result.current.error).toContain("não confirmou");
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
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
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
