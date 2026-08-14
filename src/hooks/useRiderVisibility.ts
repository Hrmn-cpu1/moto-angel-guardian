import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Opt-in "Aparecer para outros motoqueiros" (RC2 checkpoint C).
 *
 * Guarda em profiles.share_with_riders, que a RPC online_riders exige para a
 * camada comunitária. NÃO afeta contatos autorizados: quem você aprovou em
 * location_shares continua te acompanhando por trusted_contacts_online, com
 * este interruptor ligado ou desligado.
 *
 * O interruptor mestre continua sendo o compartilhamento de localização — sem
 * ele nada é publicado, com opt-in ou sem.
 */
export function useRiderVisibility() {
  const [visivel, setVisivel] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelado) {
        setCarregando(false);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("share_with_riders")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelado) return;
      if (error) setErro(error.message);
      setVisivel(Boolean(data?.share_with_riders));
      setCarregando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const alternar = useCallback(async () => {
    setSalvando(true);
    setErro(null);
    const proximo = !visivel;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada.");
      const { error } = await supabase
        .from("profiles")
        .update({ share_with_riders: proximo })
        .eq("id", user.id);
      if (error) throw new Error(error.message);
      setVisivel(proximo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }, [visivel]);

  return { visivel, carregando, salvando, erro, alternar };
}
