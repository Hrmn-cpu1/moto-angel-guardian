import { render, cleanup, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { SosController } from "@/hooks/useSosController";
import type { SosDeliveryState } from "@/lib/sos-client";
import { SosPanel } from "./SosPanel";

const manualTitle = "SOS registrado — falta você enviar pelo WhatsApp";
function controller(states: SosDeliveryState[]): SosController {
  return {
    holdMs: 3000,
    phase: "aguardando_envio",
    phaseLabel: manualTitle,
    open: true,
    busy: false,
    recovering: false,
    fix: null,
    degradedWarning: null,
    errorMessage: null,
    sosEventId: "event",
    requestId: "request",
    message: "SOS",
    mapsUrl: null,
    recipients: states.map((state, index) => ({
      id: String(index),
      name: `Contato ${index + 1}`,
      phone: "Número de teste",
      state,
      href: "https://wa.me/",
    })),
    hasContacts: states.length > 0,
    trigger: vi.fn(),
    retry: vi.fn(),
    cancel: vi.fn(),
    markOpened: vi.fn(),
    closePanel: vi.fn(),
    shareNative: vi.fn(async () => {}),
    refresh: vi.fn(),
  };
}
afterEach(cleanup);

test("a realtime provider acceptance replaces the stale manual instruction without claiming delivery", () => {
  const { rerender } = render(<SosPanel sos={controller(["preparada"])} />);
  expect(screen.getByText(manualTitle)).toBeTruthy();
  rerender(<SosPanel sos={controller(["aceita_pelo_provedor"])} />);
  expect(screen.queryByText(manualTitle)).toBeNull();
  expect(screen.getByText("SOS registrado — aceito pela API; aguarde confirmação")).toBeTruthy();
  expect(screen.queryByText("SOS registrado — entrega confirmada aos contatos")).toBeNull();
});

test.each([
  ["enviando", "SOS registrado — enviando avisos pelo WhatsApp"],
  ["recusada_pelo_provedor", "SOS registrado — envio recusado; use os botões manuais"],
  ["envio_incerto", "SOS registrado — envio sem confirmação; verifique com o contato"],
  ["entregue_confirmado", "SOS registrado — entrega confirmada aos contatos"],
] as const)("title follows current recipient state %s", (state, expected) => {
  render(<SosPanel sos={controller([state])} />);
  expect(screen.getByText(expected)).toBeTruthy();
  expect(screen.queryByText(manualTitle)).toBeNull();
});

test("mixed statuses do not claim all recipients were accepted or delivered", () => {
  render(<SosPanel sos={controller(["entregue_confirmado", "recusada_pelo_provedor"])} />);
  expect(screen.getByText("SOS registrado — confira a situação de cada contato")).toBeTruthy();
  expect(screen.queryByText("SOS registrado — entrega confirmada aos contatos")).toBeNull();
});

test("delivery state never overrides cancellation in progress", () => {
  render(
    <SosPanel
      sos={{
        ...controller(["aceita_pelo_provedor"]),
        phase: "cancelando",
        phaseLabel: "Cancelando o alerta",
      }}
    />,
  );
  expect(screen.getByText("Cancelando o alerta")).toBeTruthy();
  expect(screen.queryByText("SOS registrado — aceito pela API; aguarde confirmação")).toBeNull();
});
