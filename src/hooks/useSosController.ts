import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useContacts } from "@/hooks/useContacts";
import { useGeolocation } from "@/hooks/useGeolocation";
import { historyKey } from "@/hooks/useHistory";
import { triggerSos, dispatchSosNotifications } from "@/lib/sos.functions";
import {
  SOS_HOLD_MS,
  buildSosMessage,
  clearActiveSos,
  deliveryStateFromRow,
  guardTrigger,
  isActiveSosStatus,
  isEventoEncerradoError,
  loadActiveSos,
  newRequestId,
  saveActiveSos,
  sosPhaseLabel,
  validateSosFix,
  waLink,
  type SosDeliveryState,
  type SosFix,
  type SosPhase,
} from "@/lib/sos-client";

export interface SosRecipient {
  /** id da linha em whatsapp_notifications, ou o id do contato antes do registro */
  id: string;
  name: string;
  phone: string;
  state: SosDeliveryState;
  href: string;
}

export interface SosController {
  /** Milissegundos de pressão contínua exigidos — igual nos três acionadores. */
  holdMs: number;
  phase: SosPhase;
  phaseLabel: string;
  /** Painel de emergência visível. */
  open: boolean;
  /** true entre o toque e o fim do registro; trava o botão. */
  busy: boolean;
  /** true enquanto o app pergunta ao banco se há um SOS aberto de antes. */
  recovering: boolean;
  fix: SosFix | null;
  /** Aviso de precisão ruim; o SOS foi aceito mesmo assim. */
  degradedWarning: string | null;
  errorMessage: string | null;
  sosEventId: string | null;
  requestId: string | null;
  /** Texto pronto para o WhatsApp e para o compartilhamento nativo. */
  message: string;
  mapsUrl: string | null;
  recipients: SosRecipient[];
  hasContacts: boolean;
  trigger: (heldMs?: number) => void;
  retry: () => void;
  cancel: () => void;
  markOpened: (id: string) => void;
  closePanel: () => void;
  shareNative: () => Promise<void>;
  refresh: () => void;
}

type NotificationRow = {
  id: string;
  recipient_name: string;
  recipient_phone: string;
  status: string;
  emergency_contact_id: string | null;
};

/**
 * Fluxo ÚNICO de emergência.
 *
 * Os três acionadores do app — o botão flutuante do painel, o botão sobre o
 * mapa e a tela /sos — chamam este hook. Nenhum deles fala com o Supabase, com
 * o GPS ou com o WhatsApp por conta própria: se a regra mudar aqui, muda nos
 * três ao mesmo tempo.
 *
 * Sequência: guarda -> GPS novo -> validação do fix -> registro idempotente ->
 * envio manual pelo WhatsApp (e automático só quando o servidor tem credencial).
 */
export function useSosRuntime(): SosController {
  const { capture } = useGeolocation();
  const { contacts } = useContacts();
  const qc = useQueryClient();

  const [phase, setPhase] = useState<SosPhase>("ocioso");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [fix, setFix] = useState<SosFix | null>(null);
  const [degradedWarning, setDegradedWarning] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sosEventId, setSosEventId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [triggeredAt, setTriggeredAt] = useState<Date | null>(null);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [profileName, setProfileName] = useState("Motociclista");
  const [recoveryTick, setRecoveryTick] = useState(0);
  const refresh = useCallback(() => setRecoveryTick((tick) => tick + 1), []);

  /**
   * Lock de concorrência.
   *
   * Precisa ser ref e não state: `setState` é assíncrono, então dois toques no
   * mesmo frame leriam o mesmo valor antigo e passariam os dois. A ref muda na
   * hora, antes de qualquer `await`.
   */
  const inFlightRef = useRef(false);
  const lastTriggerRef = useRef(0);
  /** Mantido entre tentativas para que o retry seja idempotente. */
  const pendingRequestIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const recoveryEpochRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ---------------------------------------------------------------- *
   * Nome do perfil — entra na mensagem enviada ao contato
   * ---------------------------------------------------------------- */
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelado) return;
      const { data } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelado && data?.name) setProfileName(data.name);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  /* ---------------------------------------------------------------- *
   * Recuperação de um SOS ainda ativo
   *
   * Duas etapas de propósito: o snapshot local pinta a tela na hora (o
   * usuário não fica olhando para um botão "pronto" com um alerta aberto),
   * e em seguida o banco confirma ou desmente. O banco sempre vence.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    let cancelado = false;

    if (inFlightRef.current) return;
    const epoch = recoveryEpochRef.current;
    const local = loadActiveSos();
    if (local) {
      setSosEventId(local.sosEventId);
      setRequestId(local.requestId);
      setTriggeredAt(new Date(local.triggeredAt));
      if (local.lat != null && local.lng != null) {
        setFix({
          lat: local.lat,
          lng: local.lng,
          accuracy: local.accuracy,
          timestamp: local.triggeredAt,
          ageMs: 0,
          degraded: false,
        });
      }
      setPhase("aguardando_envio");
      setOpen(true);
    }

    void (async () => {
      // O try/finally aqui não é decoração: `recovering` bloqueia o botão de
      // emergência. Se esta função lançasse, o SOS ficaria travado para
      // sempre — justamente o contrário do que a recuperação existe para
      // fazer. Em qualquer falha, o botão volta a funcionar.
      try {
        const { data, error } = await supabase.rpc("sos_active_event");
        if (
          cancelado ||
          !mountedRef.current ||
          epoch !== recoveryEpochRef.current ||
          inFlightRef.current
        )
          return;

        if (error) {
          // Offline ou servidor fora: mantém o que veio do snapshot local e
          // não apaga nada — o alerta pode estar mesmo aberto.
          return;
        }

        const ativo = Array.isArray(data) ? data[0] : null;
        setErrorMessage(null);
        if (!ativo) {
          // O banco diz que não há SOS aberto: o snapshot local é resto de um
          // alerta já cancelado, possivelmente em outro aparelho.
          clearActiveSos();
          setSosEventId(null);
          setRequestId(null);
          setFix(null);
          setPhase("ocioso");
          setOpen(false);
          return;
        }

        setSosEventId(ativo.sos_event_id);
        setRequestId(ativo.request_id);
        lastTriggerRef.current = new Date(ativo.triggered_at).getTime();
        setTriggeredAt(new Date(ativo.triggered_at));
        if (ativo.latitude != null && ativo.longitude != null) {
          setFix({
            lat: Number(ativo.latitude),
            lng: Number(ativo.longitude),
            accuracy: ativo.accuracy_m != null ? Number(ativo.accuracy_m) : null,
            timestamp: new Date(ativo.triggered_at).getTime(),
            ageMs: 0,
            degraded: false,
          });
        }
        setPhase(ativo.queued > 0 ? "aguardando_envio" : "sem_contatos");
        setOpen(true);
        saveActiveSos({
          sosEventId: ativo.sos_event_id,
          requestId: ativo.request_id,
          lat: ativo.latitude != null ? Number(ativo.latitude) : null,
          lng: ativo.longitude != null ? Number(ativo.longitude) : null,
          accuracy: ativo.accuracy_m != null ? Number(ativo.accuracy_m) : null,
          triggeredAt: new Date(ativo.triggered_at).getTime(),
        });
      } catch {
        // A network exception is uncertainty, never evidence that an SOS was closed.
        if (
          !cancelado &&
          mountedRef.current &&
          epoch === recoveryEpochRef.current &&
          !inFlightRef.current
        )
          setErrorMessage(
            "Não foi possível conferir o SOS no servidor. Tentaremos novamente ao reconectar.",
          );
      } finally {
        if (!cancelado && mountedRef.current) setRecovering(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [recoveryTick]);

  /* ---------------------------------------------------------------- *
   * Notificações do evento atual, em tempo real
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (!sosEventId) {
      setRows([]);
      return;
    }
    let cancelado = false;

    const carregar = async () => {
      const { data } = await supabase
        .from("whatsapp_notifications")
        .select("id, recipient_name, recipient_phone, status, emergency_contact_id")
        .eq("sos_event_id", sosEventId)
        .order("created_at", { ascending: true });
      if (!cancelado && mountedRef.current) setRows((data ?? []) as NotificationRow[]);
    };
    void carregar();

    const canal = supabase
      .channel(`sos-wn:${sosEventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_notifications",
          filter: `sos_event_id=eq.${sosEventId}`,
        },
        () => void carregar(),
      )
      .subscribe();

    return () => {
      cancelado = true;
      supabase.removeChannel(canal);
    };
  }, [sosEventId]);

  /* ---------------------------------------------------------------- *
   * Mensagem e destinatários
   * ---------------------------------------------------------------- */
  const message = useMemo(
    () => buildSosMessage({ name: profileName, fix, when: triggeredAt ?? new Date() }),
    [profileName, fix, triggeredAt],
  );

  const mapsUrl = fix ? `https://maps.google.com/?q=${fix.lat},${fix.lng}` : null;

  const recipients = useMemo<SosRecipient[]>(() => {
    if (rows.length > 0) {
      return rows
        .filter((r) => r.status !== "cancelled")
        .map((r) => ({
          id: r.id,
          name: r.recipient_name || "Contato",
          phone: r.recipient_phone,
          state: deliveryStateFromRow(r, opened[r.id]),
          href: waLink(r.recipient_phone, message),
        }));
    }
    // Antes do registro (ou sem internet) a lista já aparece a partir dos
    // contatos salvos, para que o caminho manual nunca fique bloqueado.
    return contacts
      .filter((c) => c.phone && c.phone.trim().length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name || "Contato",
        phone: c.phone,
        state: deliveryStateFromRow({ status: null }, opened[c.id]),
        href: waLink(c.phone, message),
      }));
  }, [rows, contacts, opened, message]);

  const hasContacts = recipients.length > 0;

  /* ---------------------------------------------------------------- *
   * Acionamento
   * ---------------------------------------------------------------- */
  const executar = useCallback(async () => {
    recoveryEpochRef.current += 1;
    setErrorMessage(null);
    setDegradedWarning(null);
    setOpen(true);
    setBusy(true);
    setPhase("localizando");

    try {
      // 1. GPS NOVO. Nunca a posição que o mapa já tinha na tela.
      const leitura = await capture();
      if (!leitura.ok) {
        setFix(null);
        setPhase("gps_recusado");
        setErrorMessage(leitura.error.message);
        toast.error(leitura.error.message);
        return;
      }

      // 2. O fix precisa servir para uma emergência.
      const validado = validateSosFix({
        lat: leitura.position.lat,
        lng: leitura.position.lng,
        accuracy: leitura.position.accuracy ?? null,
        timestamp: leitura.position.timestamp,
        speed: leitura.position.speed ?? null,
        mocked: leitura.position.mocked ?? null,
      });
      if (!validado.ok) {
        setFix(null);
        setPhase("gps_recusado");
        setErrorMessage(validado.message);
        toast.error(validado.message);
        return;
      }
      setFix(validado.fix);
      if (validado.fix.degraded && validado.fix.accuracy != null) {
        setDegradedWarning(
          `Posição com margem de cerca de ${Math.round(validado.fix.accuracy)} m. O alerta vai com essa ressalva.`,
        );
      }

      // 3. request_id preservado entre tentativas: o retry não abre um segundo SOS.
      const rid = pendingRequestIdRef.current ?? newRequestId();
      pendingRequestIdRef.current = rid;
      setRequestId(rid);

      // 4. Sem internet: o alerta existe no aparelho e o caminho manual segue
      //    aberto. Nada é inventado sobre o servidor.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setPhase("sem_internet");
        setErrorMessage(
          "Sem internet. O SOS não foi registrado no servidor — envie pelo WhatsApp abaixo ou ligue 190.",
        );
        toast.error("Sem internet. Use o WhatsApp abaixo ou ligue 190.");
        return;
      }

      // 5. Registro. O banco decide se é evento novo ou o mesmo de antes.
      setPhase("registrando");
      const res = await triggerSos({
        data: {
          requestId: rid,
          lat: validado.fix.lat,
          lng: validado.fix.lng,
          accuracy: validado.fix.accuracy,
          fixAgeMs: validado.fix.ageMs,
          note: null,
        },
      });

      setSosEventId(res.sosEventId);
      setRequestId(res.requestId);
      setTriggeredAt(new Date(res.triggeredAt));
      lastTriggerRef.current = Date.now();
      pendingRequestIdRef.current = null;

      // O snapshot local só existe para alertas EM CURSO. Se o banco devolveu
      // um evento que não está mais aberto, guardá-lo faria o painel reabrir
      // sozinho no próximo F5 anunciando um socorro que já acabou.
      if (!isActiveSosStatus(res.status)) {
        clearActiveSos();
        setPhase("falha_registro");
        setErrorMessage(
          `O servidor devolveu um alerta já encerrado (${res.status}). Acione de novo para abrir um SOS novo.`,
        );
        toast.error("Esse acionamento já estava encerrado. Acione de novo.");
        return;
      }

      saveActiveSos({
        sosEventId: res.sosEventId,
        requestId: res.requestId,
        lat: validado.fix.lat,
        lng: validado.fix.lng,
        accuracy: validado.fix.accuracy,
        triggeredAt: new Date(res.triggeredAt).getTime(),
      });
      void qc.invalidateQueries({ queryKey: historyKey });

      if (res.queued === 0) {
        setPhase("sem_contatos");
        toast.info("SOS registrado. Você ainda não tem contato de emergência cadastrado.");
        return;
      }

      setPhase("aguardando_envio");
      toast.success(
        res.reused
          ? "Este SOS já estava aberto. Continue o envio pelo WhatsApp."
          : `SOS registrado. ${res.queued} contato(s) prontos para receber.`,
      );

      // 6. Envio automático apenas quando o servidor tem credencial da Meta.
      //    Mesmo assim, "aceito pela API" não vira "entregue" na tela.
      if (res.autoDispatch) {
        try {
          const d = await dispatchSosNotifications({
            data: { sosEventId: res.sosEventId, onlyFailed: false },
          });
          if ((d.unknown ?? 0) > 0) {
            toast.warning(
              `${d.unknown} envio(s) sem confirmação. Verifique com o contato antes de reenviar.`,
            );
          } else if (d.accepted > 0 && d.failed === 0) {
            toast.success(`Envio aceito pela API do WhatsApp (${d.accepted}).`);
          } else if (d.accepted > 0) {
            toast.warning(`${d.accepted} aceito(s), ${d.failed} recusado(s). Envie o resto à mão.`);
          } else if (d.claimed > 0) {
            toast.error("A API do WhatsApp recusou os envios. Use os botões abaixo.");
          }
        } catch {
          toast.warning(
            "Não foi possível confirmar o envio automático. Verifique com o contato antes de reenviar.",
          );
        }
      }
    } catch (e) {
      // request_id de um evento já encerrado: o velho não serve mais, então
      // é descartado para que a próxima tentativa gere um novo em vez de
      // insistir num acionamento que o banco vai recusar de novo.
      if (isEventoEncerradoError(e)) {
        pendingRequestIdRef.current = null;
        clearActiveSos();
        setSosEventId(null);
        setRequestId(null);
        setPhase("falha_registro");
        setErrorMessage(
          "Esse acionamento já tinha sido encerrado. Toque em tentar de novo para abrir um SOS novo.",
        );
        toast.error("Acionamento já encerrado. Tente de novo para abrir um novo SOS.");
        return;
      }
      const msg = e instanceof Error ? e.message : "O servidor não confirmou o registro do SOS.";
      setPhase("falha_registro");
      setErrorMessage(`${msg} Envie pelo WhatsApp abaixo ou ligue 190.`);
      toast.error(msg);
    } finally {
      if (mountedRef.current) setBusy(false);
      inFlightRef.current = false;
    }
  }, [capture, qc]);

  const trigger = useCallback(
    (heldMs?: number) => {
      // Enquanto o app não sabe se já existe um SOS aberto, acionar poderia
      // criar um segundo alerta ou sobrescrever o snapshot do primeiro.
      // O botão já vem desabilitado; esta é a trava de lógica por trás dele.
      if (recovering) {
        toast.info("Um instante — verificando se você já tem um alerta aberto.");
        return;
      }
      const guarda = guardTrigger({
        inFlight: inFlightRef.current,
        activeSosId: sosEventId,
        lastTriggerAt: lastTriggerRef.current,
        heldMs,
      });
      if (!guarda.allowed) {
        // O alerta já existe: abre o painel em vez de só reclamar.
        if (guarda.reason === "sos_ja_ativo" || guarda.reason === "acionado_ha_pouco") {
          setOpen(true);
        }
        if (guarda.reason !== "em_andamento") toast.info(guarda.message);
        return;
      }
      // Trava ANTES do primeiro await. Aqui não cabe setState.
      inFlightRef.current = true;
      void executar();
    },
    [executar, sosEventId, recovering],
  );

  const retry = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    void executar();
  }, [executar]);

  /* ---------------------------------------------------------------- *
   * Cancelamento — persistido no banco, não só na tela
   * ---------------------------------------------------------------- */
  const cancel = useCallback(() => {
    const id = sosEventId;
    recoveryEpochRef.current += 1;

    const limpar = () => {
      recoveryEpochRef.current += 1;
      clearActiveSos();
      pendingRequestIdRef.current = null;
      setSosEventId(null);
      setRequestId(null);
      setFix(null);
      setRows([]);
      setOpened({});
      setErrorMessage(null);
      setDegradedWarning(null);
      setTriggeredAt(null);
      setPhase("ocioso");
      setOpen(false);
    };

    if (!id) {
      limpar();
      return;
    }

    setPhase("cancelando");
    void (async () => {
      const { error } = await Promise.resolve(
        supabase.rpc("sos_cancel", {
          _sos_event_id: id,
          _reason: "Cancelado pelo usuário no app",
        }),
      ).catch(() => ({ error: new Error("Cancelamento não confirmado") }));
      if (error) {
        // O alerta continua aberto no servidor: não fingir que fechou.
        setPhase("aguardando_envio");
        setErrorMessage(
          "O servidor não confirmou o cancelamento. O SOS continua aberto — tente de novo.",
        );
        toast.error("O servidor não confirmou o cancelamento.");
        return;
      }
      limpar();
      void qc.invalidateQueries({ queryKey: historyKey });
      toast.success("SOS cancelado.");
    })();
  }, [sosEventId, qc]);

  const markOpened = useCallback((id: string) => {
    setOpened((o) => ({ ...o, [id]: true }));
  }, []);

  const closePanel = useCallback(() => setOpen(false), []);

  const shareNative = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    try {
      if (typeof nav.share === "function") {
        await nav.share({ title: "Moto Anjo — SOS", text: message, url: mapsUrl ?? undefined });
        return;
      }
      if (nav.clipboard) {
        await nav.clipboard.writeText(message);
        toast.success("Alerta copiado. Cole no WhatsApp ou no SMS.");
      }
    } catch {
      /* o usuário fechou a folha de compartilhamento */
    }
  }, [message, mapsUrl]);

  return {
    holdMs: SOS_HOLD_MS,
    phase,
    phaseLabel: sosPhaseLabel(phase),
    open,
    busy,
    recovering,
    fix,
    degradedWarning,
    errorMessage,
    sosEventId,
    requestId,
    message,
    mapsUrl,
    recipients,
    hasContacts,
    trigger,
    retry,
    cancel,
    markOpened,
    closePanel,
    shareNative,
    refresh,
  };
}

// One runtime per authenticated session. Buttons only consume its state.
export const SosContext = createContext<SosController | null>(null);
export function useSosController(): SosController {
  const value = useContext(SosContext);
  if (!value) throw new Error("SOS requer a sessão autenticada.");
  return value;
}
