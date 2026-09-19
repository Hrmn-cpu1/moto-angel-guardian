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

  it("trata pedido de ajuda como intenção que exige confirmação", () => {
    expect(interpretarComando("Daisy, preciso de ajuda").type).toBe("help");
  });

  it("não transforma frase desconhecida em ação", () => {
    expect(interpretarComando("Daisy, faça qualquer coisa").type).toBe("unknown");
  });
});
