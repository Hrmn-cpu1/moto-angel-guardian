import { supabase } from "@/integrations/supabase/client";

/**
 * Acesso a objetos de banco criados no RC2 que ainda NÃO existem no
 * `types.ts` gerado pelo Supabase.
 *
 * `src/integrations/supabase/*` é gerado e não deve ser editado à mão, então
 * `profiles.share_with_riders` e a RPC `trusted_contacts_online` ainda não
 * aparecem nos tipos. Sem esta ponte, o `tsc` reprovaria chamadas legítimas.
 *
 * É um recorte estreito e tipado — não é `any` espalhado.
 *
 * TODO — REMOVER ESTA PONTE. Não é arquitetura, é andaime.
 * Depois de aplicar as migrations RC2-B e RC2-C e regerar os tipos do
 * Supabase (`Database` em src/integrations/supabase/types.ts):
 *   1. apagar este arquivo;
 *   2. trocar os chamadores pelo cliente tipado — hoje são
 *      src/hooks/useRiderVisibility.ts (profiles.share_with_riders) e
 *      src/hooks/useNearbyRiders.ts (rpc trusted_contacts_online);
 *   3. rodar `npm run typecheck`.
 * Há um teste em rc2-estrutural que lista os chamadores: se ele falhar
 * porque a lista mudou, é sinal de que a ponte está crescendo — e ela não
 * deve crescer.
 */

interface RespostaSimples<T> {
  data: T | null;
  error: { message: string } | null;
}

interface ConsultaSolta {
  from: (tabela: string) => {
    select: (colunas: string) => {
      eq: (
        coluna: string,
        valor: string,
      ) => { maybeSingle: () => Promise<RespostaSimples<Record<string, unknown>>> };
    };
    update: (valores: Record<string, unknown>) => {
      eq: (coluna: string, valor: string) => Promise<RespostaSimples<unknown>>;
    };
  };
  rpc: (
    funcao: string,
    argumentos?: Record<string, unknown>,
  ) => Promise<RespostaSimples<unknown[]>>;
}

export function dbNovo(): ConsultaSolta {
  return supabase as unknown as ConsultaSolta;
}
