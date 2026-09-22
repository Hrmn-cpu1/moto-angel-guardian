import { describe, expect, it } from "vitest";
import { interpretarComando, normalizarComando } from "./daisy";

describe("DAISY command parser", () => {
  it("normaliza acentos e pontuação", () => {
    expect(normalizarComando("Daisy, iniciar viagem segura!")).toBe("daisy iniciar viagem segura");
  });

  it("entende iniciar viagem", () => {
    expect(interpretarComando("Daisy, iniciar viagem segura").type).toBe("start_trip");
  });

  it("entende consulta de destino", () => {
    expect(interpretarComando("Daisy, qual meu próximo destino?").type).toBe("destination");
  });

  it("trata pedidos naturais de emergência como intenção que exige confirmação", () => {
    expect(interpretarComando("Daisy, preciso de ajuda").type).toBe("help");
    expect(interpretarComando("Daisy manda um SOS").type).toBe("help");
    expect(interpretarComando("socorro").type).toBe("help");
  });

  it("só confirma SOS com uma segunda fala explícita", () => {
    expect(interpretarComando("Daisy, confirmar SOS").type).toBe("confirm_sos");
    expect(interpretarComando("pode mandar o SOS").type).toBe("confirm_sos");
  });

  it("permite cancelar a confirmação de SOS por voz", () => {
    expect(interpretarComando("Daisy, cancelar SOS").type).toBe("cancel_sos");
  });

  it("consulta o estado real da proteção sem acionar nada", () => {
    expect(interpretarComando("Daisy, estou protegido?").type).toBe("protection_status");
    expect(interpretarComando("qual o status da viagem segura").type).toBe("protection_status");
  });

  it("não transforma frase desconhecida em ação", () => {
    expect(interpretarComando("Daisy, faça qualquer coisa").type).toBe("unknown");
  });
});
