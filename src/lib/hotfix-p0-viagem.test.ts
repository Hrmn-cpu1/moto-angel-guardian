import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizarHandle, ouvirPosicaoNativa, iniciarServicoDeViagem } from "./trip-service.ts";

/* ============================================================ *
 * P0 #1 — addListener do Capacitor 7 pode ser síncrono
 * O crash real: `t.addListener(...).then is not a function`
 * ============================================================ */

type Plugin = Record<string, unknown>;

function instalarPlugin(p: Plugin | null) {
  const capacitor = {
    isNativePlatform: () => true,
    Plugins: p ? { ViagemSegura: p } : {},
  };
  (globalThis as Record<string, unknown>).window = {
    location: { pathname: "/dashboard", href: "http://localhost/dashboard" },
    navigator: { userAgent: "test" },
    Capacitor: capacitor,
  };
  (globalThis as Record<string, unknown>).Capacitor = capacitor;
}

function limpar() {
  delete (globalThis as Record<string, unknown>).Capacitor;
  delete (globalThis as Record<string, unknown>).window;
}

const espera = () => new Promise((r) => setTimeout(r, 0));

test("1) listener com handle SÍNCRONO não lança e entrega posições", async () => {
  let removido = false;
  const capturado: { cb: ((p: unknown) => void) | null } = { cb: null };
  instalarPlugin({
    addListener: (_e: string, f: (p: unknown) => void) => {
      capturado.cb = f;
      return {
        remove: () => {
          removido = true;
        },
      };
    },
  });
  const recebidas: unknown[] = [];
  const cancelar = ouvirPosicaoNativa((p) => recebidas.push(p));
  await espera();
  capturado.cb?.({ lat: 1, lng: 2, precisaoM: 5, velocidadeMs: 3, quandoMs: 1 });
  assert.equal(recebidas.length, 1);
  cancelar();
  await espera();
  assert.equal(removido, true);
  limpar();
});

test("2) listener que devolve Promise de handle continua funcionando", async () => {
  let removido = false;
  instalarPlugin({
    addListener: async () => ({
      remove: async () => {
        removido = true;
      },
    }),
  });
  const cancelar = ouvirPosicaoNativa(() => {});
  await espera();
  cancelar();
  await espera();
  assert.equal(removido, true);
  limpar();
});

test("3) addListener que LANÇA não derruba quem chamou", async () => {
  instalarPlugin({
    addListener: () => {
      throw new Error("plugin incompatível");
    },
  });
  let cancelar: (() => void) | null = null;
  assert.doesNotThrow(() => {
    cancelar = ouvirPosicaoNativa(() => {});
  });
  await espera();
  assert.doesNotThrow(() => cancelar?.());
  limpar();
});

test("4) plugin indisponível devolve cancelador inerte", () => {
  instalarPlugin(null);
  const cancelar = ouvirPosicaoNativa(() => {});
  assert.equal(typeof cancelar, "function");
  assert.doesNotThrow(() => cancelar());
  limpar();
});

test("5) falha ao iniciar o serviço vira estado controlado, não exceção", async () => {
  instalarPlugin({
    iniciar: () => {
      throw new Error("service start failed");
    },
    addListener: () => ({ remove: () => {} }),
  });
  // RC4: o retorno deixou de ser boolean. O contrato continua o mesmo — não
  // lançar — e ficou mais forte: agora o motivo da falha viaja junto, em vez
  // de virar um `false` mudo.
  const r = await iniciarServicoDeViagem("Centro");
  assert.equal(r.ativo, false, "não pode anunciar proteção que não existe");
  assert.equal(r.motivo, "falha_ao_iniciar");
  limpar();
});

test("6) viagem segue em modo degradado: publicar não propaga rejeição", () => {
  const hook = readFileSync("src/hooks/useTrip.ts", "utf8");
  assert.match(hook, /iniciarServicoDeViagem\(rotuloDoDestino\(v\)\)\.catch\(/);
  assert.match(hook, /pararServicoDeViagem\(\)\.catch\(/);
});

test("normalizarHandle aceita os dois contratos", async () => {
  const sync = { remove: () => {} };
  assert.equal(await normalizarHandle(sync), sync);
  const asyncH = { remove: async () => {} };
  assert.equal(await normalizarHandle(Promise.resolve(asyncH)), asyncH);
});

/* ============================================================ *
 * P0 #2 — Directions REQUEST_DENIED vira estado controlado
 * ============================================================ */

const mapa = readFileSync("src/components/RealMap.tsx", "utf8");

test("7) falha de rota é capturada e não sobe para o boundary raiz", () => {
  assert.match(mapa, /\.catch\(\(error\) => \{/);
  assert.match(mapa, /setRotaIndisponivel\(true\)/);
  assert.ok(!/throw /.test(mapa.split(".catch((error)")[1] ?? ""));
});

test("8) destino é preservado e o recálculo pode ser pedido de novo", () => {
  assert.match(mapa, /Rota temporariamente indisponível\. Seu destino continua salvo\./);
  assert.match(mapa, /setTentativaRota\(\(t\) => t \+ 1\)/);
  assert.match(mapa, /\[destKey, originKey, state, tentativaRota\]/);
});

test("nenhum uso de addListener(...).then no código do app", () => {
  const arquivos = ["src/lib/trip-service.ts", "src/lib/native-auth.ts"];
  for (const f of arquivos) {
    assert.ok(!/\.addListener\([^\n]*\)\.then\(/.test(readFileSync(f, "utf8")), f);
  }
});
