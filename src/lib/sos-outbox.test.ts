import test from "node:test";
import assert from "node:assert/strict";
import {
  SOS_PENDING_TTL_MS,
  parsePendingSosIntent,
  serializePendingSosIntent,
} from "./sos-client.ts";

const requestId = "3f78a0a0-0ad5-4f95-8e49-6d6e37f6f181";

test("pedido offline conserva o mesmo request_id dentro da janela de reenvio", () => {
  const raw = serializePendingSosIntent({ requestId, createdAt: 1_000 });
  assert.deepEqual(parsePendingSosIntent(raw, 1_000 + SOS_PENDING_TTL_MS), {
    requestId,
    createdAt: 1_000,
  });
});

test("pedido antigo, futuro ou adulterado nunca abre SOS automático", () => {
  const raw = serializePendingSosIntent({ requestId, createdAt: 1_000 });
  assert.equal(parsePendingSosIntent(raw, 1_001 + SOS_PENDING_TTL_MS), null);
  assert.equal(parsePendingSosIntent(raw, 999), null);
  assert.equal(parsePendingSosIntent('{"requestId":"não-é-uuid","createdAt":1000}', 1000), null);
  assert.equal(parsePendingSosIntent("lixo", 1000), null);
});
