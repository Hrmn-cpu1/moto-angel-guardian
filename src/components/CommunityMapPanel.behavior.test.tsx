import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CommunityAlertsSheet,
  CommunityRadar,
  CommunityReportSheet,
  sortNearbyAlerts,
} from "./CommunityMapPanel";
import type { NearbyAlert } from "@/hooks/useAlerts";

// Keep the component tests off the live database and realtime client.
vi.mock("@/hooks/useAlerts", () => ({
  ALERT_LABEL: {
    perigo: "Perigo",
    acidente: "Acidente",
    bloqueio: "Bloqueio",
    roubo: "Roubo",
    sos: "SOS ativo",
  },
}));
afterEach(cleanup);

function alert(id: string, distance: number, type: NearbyAlert["type"] = "perigo"): NearbyAlert {
  return {
    id,
    type,
    title: `Relato ${id}`,
    description: null,
    address: null,
    lat: -23.55,
    lng: -46.63,
    created_at: "2026-09-08T20:00:00Z",
    author_name: "Comunidade",
    distance_km: distance,
    is_mine: false,
  };
}

test("selecting a hazard does not publish until the rider confirms", async () => {
  const publish = vi.fn(async () => {});
  render(<CommunityReportSheet onPublish={publish} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Buraco" }));
  expect(publish).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Publicar aviso aqui" }));
  await waitFor(() => expect(screen.getByText("Aviso publicado")).toBeTruthy());
  expect(publish).toHaveBeenCalledExactlyOnceWith({ type: "perigo", title: "Buraco na pista" });
});

test("a pending request blocks duplicate submissions and never claims success early", async () => {
  let done!: () => void;
  const publish = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        done = resolve;
      }),
  );
  render(<CommunityReportSheet onPublish={publish} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Acidente" }));
  const button = screen.getByRole("button", { name: "Publicar aviso aqui" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(publish).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Aviso publicado")).toBeNull();
  done();
  await waitFor(() => expect(screen.getByText("Aviso publicado")).toBeTruthy());
});

test("GPS or database failure preserves selection and does not claim publication", async () => {
  const publish = vi.fn(async () => {
    throw new Error("GPS indisponível");
  });
  render(<CommunityReportSheet onPublish={publish} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Óleo / pista lisa" }));
  fireEvent.click(screen.getByRole("button", { name: "Publicar aviso aqui" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("GPS indisponível"));
  expect(screen.queryByText("Aviso publicado")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Óleo / pista lisa" }).getAttribute("aria-pressed"),
  ).toBe("true");
});

test("closing the report does not publish", () => {
  const publish = vi.fn();
  const close = vi.fn();
  render(<CommunityReportSheet onPublish={publish} onClose={close} />);
  fireEvent.click(screen.getByRole("button", { name: "Fechar avisos" }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(publish).not.toHaveBeenCalled();
});

test("radar distinguishes no reports from a failed query", () => {
  const { rerender } = render(
    <CommunityRadar alerts={[]} loading={false} error={null} onOpen={vi.fn()} />,
  );
  expect(screen.getByText("Nenhum aviso recebido")).toBeTruthy();
  rerender(
    <CommunityRadar alerts={[]} loading={false} error={new Error("offline")} onOpen={vi.fn()} />,
  );
  expect(screen.queryByText("Nenhum aviso recebido")).toBeNull();
  expect(screen.getByText("Avisos indisponíveis")).toBeTruthy();
});

test("radar prioritizes a real SOS without mutating cached alerts", () => {
  const alerts = [alert("far", 10), alert("close", 0.2), alert("sos", 3, "sos")];
  expect(sortNearbyAlerts(alerts).map((a) => a.id)).toEqual(["sos", "close", "far"]);
  expect(alerts[0].id).toBe("far");
});

test("nearby reports show the source and distance without external navigation", () => {
  const report = vi.fn();
  render(
    <CommunityAlertsSheet
      alerts={[alert("buraco", 0.2)]}
      loading={false}
      error={null}
      onRefresh={vi.fn()}
      onReport={report}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText("200 m")).toBeTruthy();
  expect(screen.getByText(/Relatado/).textContent).toContain("Comunidade");
  fireEvent.click(screen.getByRole("button", { name: "Avisar perigo" }));
  expect(report).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("link")).toBeNull();
});
