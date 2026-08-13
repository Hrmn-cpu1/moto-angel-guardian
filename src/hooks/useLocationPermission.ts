import { useCallback, useEffect, useState } from "react";
import {
  LIMITE_DE_CONSULTA_MS,
  assinarPermissao,
  consultarPermissao,
  definirLeitura,
  estadoQuandoNaoSabemos,
  leituraAtual,
  pedirPermissao,
  precisaMostrarGate,
  type LeituraPermissao,
  type StatusPermissao,
} from "@/lib/location-permission";

/**
 * Uma única fonte de verdade para a permissão de localização.
 *
 * O estado mora no módulo `location-permission`, então trocar de aba
 * (Home → Alertas → Home) não zera nada e o onboarding não reaparece.
 * Reconsulta ao voltar para a tela porque a permissão pode ter sido revogada
 * nas Configurações enquanto o app estava em segundo plano.
 */
export function useLocationPermission(): {
  status: StatusPermissao;
  origem: LeituraPermissao["origem"];
  concedida: boolean;
  mostrarGate: boolean;
  verificando: boolean;
  pedir: () => Promise<StatusPermissao>;
  reconsultar: () => Promise<StatusPermissao>;
} {
  const [leitura, setLeitura] = useState<LeituraPermissao>(() => leituraAtual());

  useEffect(() => assinarPermissao(setLeitura), []);

  useEffect(() => {
    // Só consulta quando ainda não sabemos. Se já está concedida, a tela
    // aparece na hora, sem piscar o onboarding.
    if (leituraAtual().status !== "desconhecido") return;
    void consultarPermissao();

    // Segunda trava. `consultarPermissao` já garante que sempre resolve, mas
    // a tela presa em "verificando" foi um bug real e caro: se por qualquer
    // motivo o estado continuar "desconhecido", saímos para um botão
    // funcional em vez de deixar a pessoa olhando um spinner.
    const destravar = setTimeout(() => {
      if (leituraAtual().status === "desconhecido") {
        definirLeitura(estadoQuandoNaoSabemos(leituraAtual()));
      }
    }, LIMITE_DE_CONSULTA_MS * 2);
    return () => clearTimeout(destravar);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void consultarPermissao();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, []);

  const pedir = useCallback(async () => (await pedirPermissao()).status, []);
  const reconsultar = useCallback(async () => (await consultarPermissao()).status, []);

  return {
    status: leitura.status,
    origem: leitura.origem,
    concedida: leitura.status === "concedida",
    mostrarGate: precisaMostrarGate(leitura.status),
    verificando: leitura.status === "desconhecido" || leitura.status === "verificando",
    pedir,
    reconsultar,
  };
}
