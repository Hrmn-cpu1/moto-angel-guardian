/**
 * Envio do beacon de callback (cliente).
 *
 * `keepalive` porque a página de callback normalmente é substituída em
 * seguida por um `location.replace` para o deep link — sem isso o request
 * morreria junto com o documento e perderíamos justamente a prova de que o
 * callback chegou. Falha de rede é engolida: diagnóstico não pode derrubar
 * o login.
 */
export interface BeaconDeCallback {
  attempt_id?: string;
  stage: "callback.web.enter" | "callback.native.detected" | "deepLink.begin";
  native_flow: boolean;
  has_state: boolean;
  has_code: boolean;
  has_error: boolean;
  has_session_params: boolean;
  error_code?: string;
  origin_host?: string;
  pathname?: string;
}

export function enviarBeaconDeCallback(dados: BeaconDeCallback): void {
  try {
    void fetch("/api/public/auth-beacon", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(dados),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* diagnóstico nunca quebra o fluxo */
  }
}
