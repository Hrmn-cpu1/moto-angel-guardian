import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DaisyVoiceButton } from "./DaisyVoiceButton";

afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

describe("DaisyVoiceButton", () => {
  it("mostra o controle flutuante e confirma a frase ouvida", async () => {
    (window as unknown as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        DaisySpeech: {
          available: async () => ({ available: true }),
          start: async () => ({ text: "Daisy iniciar viagem segura" }),
          stop: async () => undefined,
        },
      },
    };
    const onCommand = vi.fn();
    render(<DaisyVoiceButton onCommand={onCommand} variant="floating" />);

    expect(screen.getByText("DAISY")).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Falar com a DAISY" }));

    await waitFor(() => expect(screen.getByText("Comando recebido")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("Daisy iniciar viagem segura");
    expect(onCommand).toHaveBeenCalledWith({ type: "start_trip" }, "Daisy iniciar viagem segura");
  });
});
