import { describe, expect, it } from "vitest";
import { CAMADAS, camada, classesDeCamadaCompletas, type NomeDeCamada } from "./layers";
import { abrirFolha, algumaFolhaAberta, fecharFolha, sosFlutuanteVisivel } from "./sheets";
import { celulaDeBusca } from "./coords";
import { passosDoEnquadramento } from "./navigation-cue";
import { LIMITE_DE_PEDIDO_MS } from "./location-permission";

/* ================================================================== *
 * #1 — camadas: as classes precisam EXISTIR no CSS gerado
 * ================================================================== */

describe("RC3.2 · camadas de z-index", () => {
  it("nunca devolve uma classe montada em tempo de execução", () => {
    // O bug era exatamente este: `z-[${n}]`. Se voltar, o Tailwind não gera a
    // classe e a ordem visual da Home volta a ser a ordem do DOM.
    for (const nome of Object.keys(CAMADAS) as NomeDeCamada[]) {
      expect(camada(nome)).toMatch(/^z-(\d+|\[\d+\])$/);
    }
  });

  it("tem classe literal para toda camada declarada", () => {
    expect(classesDeCamadaCompletas()).toBe(true);
  });

  it("mantém o painel de SOS acima do fundo de modal, e o modal acima do FAB", () => {
    expect(CAMADAS.painelSos).toBeGreaterThan(CAMADAS.fundoModal);
    expect(CAMADAS.fundoModal).toBeGreaterThan(CAMADAS.sos);
    expect(CAMADAS.sos).toBeGreaterThan(CAMADAS.navegacao);
  });
});

/* ================================================================== *
 * #4 — uma folha inferior por vez
 * ================================================================== */

describe("RC3.2 · bottom sheets", () => {
  it("abrir uma folha fecha a anterior", () => {
    expect(abrirFolha("camadas", "destino")).toBe("destino");
    expect(abrirFolha("destino", "camadas")).toBe("camadas");
  });

  it("tocar na mesma folha fecha", () => {
    expect(abrirFolha("camadas", "camadas")).toBe("nenhuma");
  });

  it("fecha para o estado neutro", () => {
    expect(fecharFolha()).toBe("nenhuma");
    expect(algumaFolhaAberta("nenhuma")).toBe(false);
    expect(algumaFolhaAberta("viagem")).toBe(true);
  });
});

/* ================================================================== *
 * #3 — o SOS não cobre modal nem teclado
 * ================================================================== */

describe("RC3.2 · SOS flutuante", () => {
  it("aparece na Home limpa", () => {
    expect(sosFlutuanteVisivel("nenhuma", false)).toBe(true);
  });

  it("some com qualquer folha aberta", () => {
    expect(sosFlutuanteVisivel("destino", false)).toBe(false);
    expect(sosFlutuanteVisivel("camadas", false)).toBe(false);
    expect(sosFlutuanteVisivel("viagem", false)).toBe(false);
  });

  it("some com o teclado aberto", () => {
    expect(sosFlutuanteVisivel("nenhuma", true)).toBe(false);
  });
});

/* ================================================================== *
 * #1 — busca de pontos de apoio não pode seguir cada metro do GPS
 * ================================================================== */

describe("RC3.2 · célula de busca", () => {
  it("não muda com um deslocamento de poucos metros", () => {
    const a = celulaDeBusca(-23.55052, -46.633308);
    const b = celulaDeBusca(-23.55061, -46.633401);
    expect(b).toBe(a);
  });

  it("muda quando o motociclista sai da célula", () => {
    const a = celulaDeBusca(-23.55052, -46.633308);
    const b = celulaDeBusca(-23.58052, -46.633308);
    expect(b).not.toBe(a);
  });

  it("é estável e serializável", () => {
    expect(celulaDeBusca(-23.55052, -46.633308)).toBe(
      celulaDeBusca(-23.55052, -46.633308),
    );
    expect(typeof celulaDeBusca(0.1, 0.1)).toBe("string");
  });
});

/* ================================================================== *
 * #10 — enquadramento: usuário + trecho relevante
 * ================================================================== */

describe("RC3.2 · enquadramento da rota", () => {
  it("sem passos, não enquadra nada", () => {
    expect(passosDoEnquadramento([])).toBe(0);
  });

  it("inclui pelo menos um passo, mesmo curto", () => {
    expect(passosDoEnquadramento([80])).toBe(1);
  });

  it("para de somar ao cobrir o limite", () => {
    expect(passosDoEnquadramento([400, 400, 400, 400, 5000])).toBe(4);
  });

  it("não enquadra a rota inteira quando ela é longa", () => {
    const passos = [300, 900, 600, 12000, 8000];
    expect(passosDoEnquadramento(passos)).toBeLessThan(passos.length);
  });

  it("ignora distâncias ausentes sem quebrar", () => {
    expect(passosDoEnquadramento([0, 0, 0])).toBe(3);
  });
});

/* ================================================================== *
 * #2 — o pedido de permissão sempre termina
 * ================================================================== */

describe("RC3.2 · pedido de permissão", () => {
  it("tem um limite de tempo finito e maior que o timeout do GPS", () => {
    expect(Number.isFinite(LIMITE_DE_PEDIDO_MS)).toBe(true);
    expect(LIMITE_DE_PEDIDO_MS).toBeGreaterThan(10000);
  });
});