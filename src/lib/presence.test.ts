import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { devePublicarPresenca, interpretarStatus } from "./presence.ts";

test("presença não é reenviada a cada render", () => {
  assert.equal(devePublicarPresenca(1_000_000, 1_000_000, 20_000), false);
  assert.equal(devePublicarPresenca(1_010_000, 1_000_000, 20_000), false);
  assert.equal(devePublicarPresenca(1_020_000, 1_000_000, 20_000), true);
});

test("a primeira chamada sempre publica", () => {
  assert.equal(devePublicarPresenca(Date.now(), 0), true);
});

test("o status do servidor é interpretado sem inventar valor", () => {
  for (const bom of ["ok", "created", "throttled", "rejected_jump"]) {
    assert.equal(interpretarStatus(bom), bom);
  }
  assert.equal(interpretarStatus(["throttled"]), "throttled", "RPC pode devolver array");
  assert.equal(interpretarStatus(null), "desconhecido");
  assert.equal(interpretarStatus("qualquer coisa"), "desconhecido");
});

test("o throttle daqui é UX, e o módulo diz isso", () => {
  // Se um dia alguém apagar esse aviso, o próximo leitor pode achar que este
  // intervalo protege o servidor. Não protege: some numa chamada REST direta.
  const src = readFileSync(new URL("./presence.ts", import.meta.url), "utf8");
  assert.ok(/UX/.test(src) && /servidor/.test(src));
});
