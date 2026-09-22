import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, Crosshair, Layers, Navigation, Megaphone } from "lucide-react";
import {
  CommunityRadar,
  CommunityAlertsSheet,
  CommunityReportSheet,
  type RoadReport,
} from "@/components/CommunityMapPanel";
import { AppShell } from "@/components/AppShell";
import { SosFabControlado } from "@/components/SosFab";
import { HomeTopBar } from "@/components/HomeTopBar";
import { DestinationBar } from "@/components/DestinationBar";
import { CopilotCard } from "@/components/CopilotCard";
import { MapLayersSheet } from "@/components/MapLayersSheet";
import { LocationPermissionGate } from "@/components/LocationPermissionGate";
import { useLocationPermission } from "@/hooks/useLocationPermission";
import { useTecladoVirtual } from "@/hooks/useTecladoVirtual";
import { useAuth } from "@/hooks/useAuth";
import { useContacts } from "@/hooks/useContacts";
import { useLiveShare } from "@/hooks/useLiveShare";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAlerts } from "@/hooks/useAlerts";
import { useNearbyRiders } from "@/hooks/useNearbyRiders";
import { useMapLayers } from "@/hooks/useMapLayers";
import { useTrip } from "@/hooks/useTrip";
import { rotuloDoDestino } from "@/lib/trip";
import { useCockpitTelemetry } from "@/hooks/useCockpitTelemetry";
import { useSafetyCopilot } from "@/hooks/useSafetyCopilot";
import { useSosController } from "@/hooks/useSosController";
import { ChamadaViagemSegura, CockpitDeViagem, PreparacaoDeViagem } from "@/components/RideCockpit";
import { DestinoDialog } from "@/components/DestinoDialog";
import { NextManeuver } from "@/components/NextManeuver";
import { camada } from "@/lib/layers";
import { abrirFolha, sosFlutuanteVisivel, type Folha } from "@/lib/sheets";
import { celulaDeBusca } from "@/lib/coords";
import { registrarEventoDeViagem } from "@/lib/trip-diagnostics";
import {
  atualizarServicoDeViagem,
  consultarPermissaoDeNotificacao,
  descricaoDoServico,
  montarAtualizacaoDaViagem,
  servicoDisponivel,
  limparNavegacaoBloqueada,
  publicarNavegacaoBloqueada,
  type PermissaoNotificacao,
} from "@/lib/trip-service";
import { distanciaDaManobra, viaDaInstrucao } from "@/lib/navigation-cue";
import {
  montarQuadroBloqueado,
  preferenciaTelaBloqueada,
  quadrosIguais,
  QUADRO_VAZIO,
  pausarOrientacaoBloqueada,
} from "@/lib/lock-navigation";
import { APARENCIA, distanciaCurta } from "@/lib/map-events";
import { useRiskZones } from "@/hooks/useRiskZones";
import { usePartners } from "@/hooks/usePartners";
import { useServerFn } from "@tanstack/react-start";
import { searchPOIs, type POI } from "@/lib/pois.functions";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { EstadoDaRota, RouteInfo, MapAlert } from "@/components/RealMap";
import { MapErrorBoundary } from "@/components/MapErrorBoundary";
import type { DaisyCommand } from "@/lib/daisy";
import { vozDoNavegador } from "@/lib/voice";

const RealMap = lazy(() => import("@/components/RealMap"));

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Início — Moto Anjo" },
      { name: "description", content: "Painel de proteção e recursos Moto Anjo." },
      { property: "og:title", content: "Início — Moto Anjo" },
      { property: "og:description", content: "Painel de proteção e recursos Moto Anjo." },
    ],
  }),
  component: Dashboard,
});

/**
 * Home = live safety map (Waze/Uber style), full screen, dark premium theme.
 * Layers: traffic, risk heatmap, online riders, recent incidents and support
 * points (hospitals, fuel, workshops, police, partners).
 */
function Dashboard() {
  const { user, loading } = useAuth();
  const { position, capture, startWatch, stopWatch, watching } = useGeolocation();
  // A permissão vem do estado compartilhado, não de um useState local: era
  // isso que fazia o onboarding voltar ao trocar de aba (RC2 checkpoint D).
  const { concedida: granted } = useLocationPermission();
  const [follow, setFollow] = useState(true);
  const [showTraffic, setShowTraffic] = useState(true);
  const [showHeat, setShowHeat] = useState(true);
  const [showSupport, setShowSupport] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  // RC3.2: UM estado para todas as folhas inferiores. Ver `lib/sheets.ts`.
  const [folha, setFolha] = useState<Folha>("nenhuma");
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const openMapAlert = useCallback((alert: MapAlert) => {
    setSelectedAlertId(alert.id);
    setFolha("avisos");
  }, []);
  const tecladoAberto = useTecladoVirtual();
  const [rota, setRota] = useState<RouteInfo | null>(null);
  const [estadoDaRota, setEstadoDaRota] = useState<EstadoDaRota>("sem_destino");

  const [pois, setPois] = useState<POI[]>([]);
  const fetchPOIs = useServerFn(searchPOIs);
  const {
    alerts,
    loading: alertsLoading,
    error: alertsError,
    create: createAlert,
    refresh: refreshAlerts,
    liveUpdates,
  } = useAlerts(position);
  // Mesma fonte de verdade da tela /map (P0.5-B): mesma preferência, mesmas
  // regras de opt-in e a mesma separação entre comunidade e contatos.
  const { camadas, alternar } = useMapLayers();
  const { todos: riders, contatos, comunidade } = useNearbyRiders(position, 50, camadas);
  const { risks } = useRiskZones(position);

  // Viagem Segura: fonte única, no módulo. Trocar de aba não mata a viagem
  // (RC3 seções 8 e 39).
  const { viagem, servico, definirDestino, iniciar, cancelar, finalizar } = useTrip();
  const { contacts, loading: contactsLoading } = useContacts();
  const sharingState = useLiveShare();
  const viagemAtiva = viagem.estado === "ativa";
  // Cockpit é um MODO de tela, não o app inteiro: sair dele não toca na
  // viagem (nem no serviço nativo, nem na rota, nem no destino).
  const [cockpitAberto, setCockpitAberto] = useState(true);
  const modoCockpit = viagemAtiva && cockpitAberto;
  const { velocidade, rumo, inclinacao, modo } = useCockpitTelemetry(viagemAtiva);
  // O SOS ativo é lido do controlador que já existe, pela fase — não invento
  // API nova nele (RC3: não reimplementar SOS).
  const sos = useSosController();

  useEffect(() => {
    if (sos.open) setFolha("nenhuma");
  }, [sos.open]);
  const publishRoadReport = async (report: RoadReport) => {
    const fix = await capture();
    if (!fix.ok) throw new Error("Não conseguimos localizar você. Ative o GPS e tente novamente.");
    if (Date.now() - fix.position.timestamp > 60_000 || (fix.position.accuracy ?? Infinity) > 100) {
      throw new Error("O GPS ainda está impreciso. Aguarde o sinal melhorar e tente novamente.");
    }
    await createAlert.mutateAsync({ ...report, lat: fix.position.lat, lng: fix.position.lng });
    setShowAlerts(true);
  };
  // Um SOS existe no servidor a partir do registro: são as fases em que já
  // há sos_event_id. É isso que "finalizar viagem" não pode destruir.
  const sosAtivo =
    sos.phase === "aguardando_envio" || sos.phase === "sem_contatos" || sos.sosEventId != null;
  const { aviso, vozLigada, vozSuportada, alternarVoz } = useSafetyCopilot({
    alerts,
    pois,
    riders,
    viagemAtiva,
    modo,
  });
  const { located: locatedPartners } = usePartners();
  // DAISY Fase 1: comandos determinísticos. A voz nunca dispara uma ação
  // crítica sem confirmação e nunca substitui o motor nativo de segurança.
  const daisySosPendenteAteRef = useRef(0);

  const onDaisyCommand = useCallback(
    (command: DaisyCommand) => {
      switch (command.type) {
        case "start_trip":
          if (viagemAtiva) {
            vozDoNavegador.falar("A viagem segura já está ativa.");
          } else if (viagem.destino) {
            iniciar();
            vozDoNavegador.falar(
              "Viagem segura iniciada no aplicativo. Preparando a proteção em segundo plano.",
            );
          } else {
            setFolha("destino");
            vozDoNavegador.falar(
              "Escolha seu destino primeiro. Depois podemos iniciar a viagem segura.",
            );
          }
          break;
        case "destination": {
          const destino = rotuloDoDestino(viagem);
          vozDoNavegador.falar(
            destino ? `Seu próximo destino é ${destino}.` : "Você ainda não definiu um destino.",
          );
          break;
        }
        case "help":
          // Emergência por voz usa confirmação em duas etapas. O primeiro
          // comando nunca dispara rede/GPS/contatos sozinho.
          daisySosPendenteAteRef.current = Date.now() + 15_000;
          vozDoNavegador.falar(
            "Pedido de SOS preparado. Diga confirmar SOS nos próximos quinze segundos para enviar, ou diga cancelar SOS.",
          );
          break;
        case "confirm_sos":
          if (Date.now() > daisySosPendenteAteRef.current) {
            daisySosPendenteAteRef.current = 0;
            vozDoNavegador.falar(
              "A confirmação expirou. Diga SOS novamente para preparar um novo pedido.",
            );
          } else if (sos.busy || sos.recovering) {
            vozDoNavegador.falar(
              "Aguarde. O sistema de emergência ainda está verificando o estado.",
            );
          } else {
            daisySosPendenteAteRef.current = 0;
            sos.trigger(sos.holdMs);
            vozDoNavegador.falar(
              "SOS confirmado. Estou obtendo sua localização e abrindo o protocolo de emergência.",
            );
          }
          break;
        case "cancel_sos":
          daisySosPendenteAteRef.current = 0;
          vozDoNavegador.falar("Pedido de SOS por voz cancelado.");
          break;
        case "protection_status":
          if (!viagemAtiva) {
            vozDoNavegador.falar("Nenhuma viagem segura está ativa.");
          } else if (servico.ativo && servico.notificacaoVisivel) {
            vozDoNavegador.falar("Viagem ativa. O Android confirmou a proteção em segundo plano.");
          } else {
            vozDoNavegador.falar(
              "Viagem ativa, mas a proteção em segundo plano ainda não foi confirmada.",
            );
          }
          break;
        case "stop_voice":
          if (vozLigada) alternarVoz();
          vozDoNavegador.calar();
          break;
        case "unknown":
          vozDoNavegador.falar("Não entendi. Você pode perguntar pelo destino ou pedir ajuda.");
          break;
      }
    },
    [viagem, viagemAtiva, servico, iniciar, vozLigada, alternarVoz, sos],
  );

  // A rota vem do Google pelo mapa; guardá-la aqui é o que permite mostrar
  // distância e ETA reais na faixa de destino.
  const aoCalcularRota = useCallback((r: RouteInfo | null) => setRota(r), []);
  // Estado HONESTO do cálculo: é o que impede a prévia de ficar muda entre
  // "escolhi o destino" e "a rota apareceu".
  const aoMudarEstadoDaRota = useCallback((e: EstadoDaRota) => setEstadoDaRota(e), []);

  /**
   * Linha do Copiloto durante a navegação. Só duas origens possíveis: o
   * evento real mais próximo ou o silêncio. Nada é gerado sem dado.
   */
  const textoDoCopiloto = aviso
    ? `${alerts.find((a) => a.id === aviso.id)?.title || APARENCIA[aviso.categoria].rotulo} • ${distanciaCurta(aviso.distanciaKm)}`
    : "Sem avisos próximos";

  /* ---------------------------------------------------------------- *
   * Proteção em segundo plano — o que o Android realmente disse.
   *
   * Nunca deduzido do estado da viagem: viagem ativa com serviço recusado é
   * uma combinação possível, e era justamente ela que o app escondia.
   * ---------------------------------------------------------------- */
  const [permissaoNotificacao, setPermissaoNotificacao] = useState<PermissaoNotificacao | null>(
    null,
  );
  const temServico = servicoDisponivel();

  useEffect(() => {
    if (!temServico) return;
    void consultarPermissaoDeNotificacao()
      .then(setPermissaoNotificacao)
      .catch(() => undefined);
  }, [temServico, viagem.estado]);

  const segundoPlanoNaBarra = useMemo(
    () =>
      temServico
        ? {
            ok: servico.ativo && servico.notificacaoVisivel,
            descricao: descricaoDoServico(servico),
          }
        : null,
    [temServico, servico],
  );

  const segundoPlanoNaPreparacao = useMemo(() => {
    if (!temServico) return null;
    if (!permissaoNotificacao) return { ok: false, rotulo: "Verificando" };
    return {
      ok: permissaoNotificacao.podeMostrar,
      rotulo: permissaoNotificacao.podeMostrar ? "Pronto" : "Sem notificação",
    };
  }, [temServico, permissaoNotificacao]);

  const destinoDaNotificacao = useMemo(() => rotuloDoDestino(viagem), [viagem]);

  /* ---------------------------------------------------------------- *
   * Estabilidade de props do mapa.
   *
   * BUG REAL (RC3.2 #1, o travamento): `center`, `alerts`, `riders`,
   * `pois`, `partners` e `destination` eram objetos/arrays criados no JSX,
   * ou seja, NOVOS a cada render. Os efeitos do RealMap dependem dessas
   * referências, então cada render destruía e recriava TODOS os marcadores
   * do Google — dezenas de overlays, cada um com um ícone SVG em data URL.
   *
   * Em viagem a Home re-renderiza a cada leitura do GPS (~1 Hz) e a cada
   * tick de telemetria. Num aparelho real isso é reconstruir o mapa inteiro
   * várias vezes por segundo: o WebView acumula memória até o Chrome matar a
   * página — que é exatamente a tela "This page didn't load".
   *
   * A correção é memorizar por VALOR. Nada de lógica nova; só parar de
   * mentir para o React sobre o que mudou.
   * ---------------------------------------------------------------- */
  const centro = useMemo(
    () => (position ? { lat: position.lat, lng: position.lng } : null),
    [position?.lat, position?.lng],
  );

  const alertasNoMapa = useMemo(
    () =>
      showAlerts
        ? alerts.map((a) => ({ id: a.id, type: a.type, title: a.title, lat: a.lat, lng: a.lng }))
        : [],
    [alerts, showAlerts],
  );

  const ridersNoMapa = useMemo(
    () =>
      riders.map((r) => ({
        id: r.user_id,
        name: r.name,
        avatarUrl: r.avatar_url,
        lat: r.lat,
        lng: r.lng,
      })),
    [riders],
  );

  const parceirosNoMapa = useMemo(
    () =>
      showSupport
        ? locatedPartners.map((p) => ({
            id: p.id,
            name: p.name,
            benefit: p.benefit,
            logoUrl: p.logo_url,
            featured: p.featured,
            lat: p.lat as number,
            lng: p.lng as number,
          }))
        : [],
    [locatedPartners, showSupport],
  );

  const poisNoMapa = useMemo(() => (showSupport ? pois : []), [pois, showSupport]);

  const destinoNoMapa = useMemo(
    () =>
      viagem.destino
        ? {
            lat: viagem.destino.latitude,
            lng: viagem.destino.longitude,
            address: viagem.destino.address,
          }
        : null,
    [viagem.destino?.latitude, viagem.destino?.longitude, viagem.destino?.address],
  );

  /* Notificação da viagem = o que aparece na tela de bloqueio.
   *
   * BUG REAL (RC4): esta chamada mandava só alerta e distância. O plugin
   * completava o destino com "" e o serviço remontava a notificação do zero,
   * então a PRIMEIRA atualização — que acontece no início da viagem, quando
   * ainda não há aviso — apagava o destino e sobrava a palavra "Protegido".
   *
   * Agora o destino e a próxima manobra viajam junto, e `montarAtualizacaoDaViagem`
   * omite o que não conhecemos em vez de mandar vazio. Nenhum campo é
   * inventado: sem rota, `manobra` vai vazia e o Android mantém o resto. */
  useEffect(() => {
    if (!viagemAtiva) return;
    void atualizarServicoDeViagem(
      montarAtualizacaoDaViagem({
        destino: destinoDaNotificacao,
        alerta: aviso ? APARENCIA[aviso.categoria].rotulo : "",
        distanciaDoAlerta: aviso ? distanciaCurta(aviso.distanciaKm) : "",
        manobra: viaDaInstrucao(rota?.proximaInstrucao),
        distanciaDaManobra: distanciaDaManobra(rota?.proximaDistanciaM),
      }),
    );
  }, [
    viagemAtiva,
    destinoDaNotificacao,
    aviso?.id,
    aviso?.categoria,
    aviso?.distanciaKm,
    rota?.proximaInstrucao,
    rota?.proximaDistanciaM,
  ]);

  /* ---------------------------------------------------------------- *
   * P0.1c — Navegação na tela de bloqueio.
   *
   * O quadro é um ESPELHO do que o cockpit já mostra: mesma viagem, mesma
   * rota, mesmo GPS, mesmo Copiloto. Nada é recalculado e nenhum watcher
   * novo é criado — a Activity de bloqueio só desenha o que chega aqui.
   *
   * A preferência é lida depois da montagem porque esta rota roda com SSR:
   * tocar no armazenamento do navegador durante a renderização do servidor
   * quebraria a hidratação. A chave vive em `lib/lock-navigation.ts`.
   * ---------------------------------------------------------------- */
  const [mostrarNoBloqueio, setMostrarNoBloqueio] = useState(false);
  useEffect(() => {
    setMostrarNoBloqueio(preferenciaTelaBloqueada());
  }, []);

  const quadroBloqueado = useMemo(
    () =>
      montarQuadroBloqueado({
        viagemAtiva,
        permitida: mostrarNoBloqueio,
        manobra: viaDaInstrucao(rota?.proximaInstrucao),
        distanciaManobra: distanciaDaManobra(rota?.proximaDistanciaM),
        destino: destinoDaNotificacao,
        restante: rota ? `${rota.distanciaKm.toFixed(1)} km` : "",
        eta: rota ? `${rota.duracaoMin} min` : "",
        risco: aviso
          ? `${APARENCIA[aviso.categoria].rotulo} a ${distanciaCurta(aviso.distanciaKm)}`
          : "",
        posicao: centro,
        tracado: rota?.tracado ?? null,
      }),
    [
      viagemAtiva,
      mostrarNoBloqueio,
      rota,
      destinoDaNotificacao,
      aviso?.id,
      aviso?.categoria,
      aviso?.distanciaKm,
      centro,
    ],
  );

  const [ultimoQuadro, setUltimoQuadro] = useState(QUADRO_VAZIO);
  useEffect(() => {
    if (quadrosIguais(quadroBloqueado, ultimoQuadro)) return;
    setUltimoQuadro(quadroBloqueado);
    if (quadroBloqueado.ativa) void publicarNavegacaoBloqueada(quadroBloqueado);
    else void limparNavegacaoBloqueada();
  }, [quadroBloqueado, ultimoQuadro]);

  const quadroAtual = useRef(quadroBloqueado);
  quadroAtual.current = quadroBloqueado;
  useEffect(
    () => () => {
      if (quadroAtual.current.ativa) {
        void publicarNavegacaoBloqueada(pausarOrientacaoBloqueada(quadroAtual.current));
      }
    },
    [],
  );

  // Ao (re)entrar em viagem, a navegação volta a ser a tela dominante.
  useEffect(() => {
    if (viagemAtiva) setCockpitAberto(true);
  }, [viagemAtiva]);

  useEffect(() => {
    if (!granted) return;
    void capture({ initial: true });
    startWatch();
    return () => stopWatch();
  }, [granted, capture, startWatch, stopWatch]);

  /* Pontos de apoio.
   *
   * BUG REAL (RC3.2): o efeito dependia do OBJETO `position`, que muda a cada
   * leitura do GPS. Em movimento isso disparava uma chamada de servidor por
   * segundo — e cada resposta trocava a lista de POIs, recriando todos os
   * marcadores. A busca cobre 3 km; refazer a cada metro não descobre nada.
   *
   * Agora a chave é a CÉLULA da grade (~1 km): a busca só refaz quando o
   * motociclista realmente sai da área já coberta. */
  const celula = position ? celulaDeBusca(position.lat, position.lng) : null;
  useEffect(() => {
    if (!celula || !showSupport) return;
    let vivo = true;
    const [lat, lng] = celula.split(",").map(Number);
    registrarEventoDeViagem("pois.request.begin");
    fetchPOIs({ data: { lat, lng, radius: 3000 } })
      .then((r) => {
        // Resposta de uma célula já abandonada NÃO sobrescreve a atual.
        if (!vivo) return;
        registrarEventoDeViagem("pois.request.end", { detalhe: String(r.pois.length) });
        setPois(r.pois);
      })
      .catch((e) => {
        if (vivo) registrarEventoDeViagem("pois.request.fail");
        console.error(e);
      });
    return () => {
      vivo = false;
    };
  }, [celula, fetchPOIs, showSupport]);

  if (loading || !user) return <LoadingScreen />;

  if (!granted) {
    return (
      <AppShell>
        <div className="px-5 pt-5">
          <LocationPermissionGate onGranted={() => undefined} />
        </div>
      </AppShell>
    );
  }

  return (
    /* COCKPIT V2: durante a viagem a navegação inferior some e a âncora de
       baixo encolhe (`ma-cockpit`), para o mapa ser a tela inteira. */
    <AppShell fullBleed hideNav={false} cockpit={modoCockpit} sos={sos}>
      <div
        className={`relative h-[100dvh] w-full overflow-hidden bg-background ${
          modoCockpit ? "ma-cockpit" : ""
        }`}
      >
        <ClientOnly
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-gold">
              Preparando mapa...
            </div>
          }
        >
          <MapErrorBoundary>
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-gold">
                  Carregando mapa...
                </div>
              }
            >
              <RealMap
                center={centro}
                accuracy={position?.accuracy ?? null}
                heading={
                  position?.heading != null &&
                  Number.isFinite(position.heading) &&
                  (position.speed ?? 0) >= 2
                    ? position.heading
                    : null
                }
                follow={follow}
                navegando={modoCockpit}
                zoom={16}
                rounded={false}
                showTraffic={showTraffic}
                showHeatmap={showHeat}
                riskPoints={risks}
                pois={poisNoMapa}
                destination={destinoNoMapa}
                onRoute={aoCalcularRota}
                onRouteStatus={aoMudarEstadoDaRota}
                paddingInferiorPx={viagem.estado === "preparando" ? 150 : 160}
                alerts={alertasNoMapa}
                onAlertSelect={openMapAlert}
                riders={ridersNoMapa}
                partners={parceirosNoMapa}
                className="absolute inset-0"
              />
            </Suspense>
          </MapErrorBoundary>
        </ClientOnly>

        {/* Cabeçalho e faixa de destino: só fora da viagem. Durante a
            navegação esses ~110px pertencem à próxima manobra. */}
        {!modoCockpit && (
          <>
            <HomeTopBar
              gpsOnline={watching && !!position}
              copilotOnline={!!position}
              tripActive={viagemAtiva}
              segundoPlano={segundoPlanoNaBarra}
              temServico={temServico}
              onDaisyCommand={onDaisyCommand}
            />

            {/* Na preparação a prévia já mostra destino, ETA e distância.
                Manter a faixa aqui seria a MESMA informação duas vezes na
                mesma tela. */}
            {viagem.estado !== "preparando" && (
              <DestinationBar
                viagem={viagem}
                rota={rota}
                onAbrirDestino={() => setFolha((f) => abrirFolha(f, "destino"))}
              />
            )}
          </>
        )}

        {/* Saída do modo cockpit: só fecha a tela cheia. A viagem, a rota,
            o destino e o serviço em segundo plano continuam. */}
        {modoCockpit && (
          <button
            onClick={() => setCockpitAberto(false)}
            aria-label="Voltar ao app"
            className={`absolute left-3 top-[var(--ma-top)] ${camada(
              "cartoesDoMapa",
            )} grid h-11 w-11 place-items-center rounded-xl bg-map-panel/90 text-gold shadow-map backdrop-blur-xl`}
          >
            <ArrowLeft size={17} />
          </button>
        )}

        {/* Viagem ativa com cockpit fechado: atalho para retomar. */}
        {viagemAtiva && !cockpitAberto && (
          <button
            onClick={() => setCockpitAberto(true)}
            className={`absolute inset-x-3 bottom-[calc(var(--ma-bottom)+86px)] ${camada(
              "painelInferior",
            )} flex ma-cta-h items-center justify-center gap-2 rounded-xl bg-map-panel/95 text-sm font-bold text-gold shadow-map backdrop-blur-xl`}
          >
            <Navigation size={16} /> Viagem ativa — Retomar navegação
          </button>
        )}

        {/* Próxima manobra: informação dominante do cockpit. */}
        {modoCockpit && (
          <NextManeuver
            rota={rota}
            destino={destinoDaNotificacao || null}
            className="absolute left-[60px] right-3 top-[var(--ma-top)]"
          />
        )}

        {/* Controles do mapa.
            Em viagem só ficam os dois que servem para navegar: recentralizar
            e camadas (a folha de camadas continua dando acesso a TUDO —
            anjos, apoio, riscos, trânsito). Nenhum handler mudou. */}
        <div
          className={`absolute right-3 ${
            modoCockpit ? "top-[calc(var(--ma-top)+128px)]" : "top-[calc(var(--ma-top)+196px)]"
          } z-30 flex flex-col gap-2`}
        >
          <LayerToggle
            active={follow}
            onClick={() => {
              setFollow(true);
              void capture();
            }}
            label="Centralizar"
            icon={<Crosshair size={14} />}
            destaque
          />
          <LayerToggle
            active={folha === "camadas"}
            onClick={() => setFolha((f) => abrirFolha(f, "camadas"))}
            label="Camadas do mapa"
            icon={<Layers size={14} />}
            discreto={modoCockpit}
          />
          {modoCockpit && folha === "nenhuma" && !sos.open && (
            <button
              type="button"
              onClick={() => setFolha("avisar")}
              aria-label="Avisar perigo"
              className="flex min-h-[56px] min-w-[48px] flex-col items-center justify-center gap-1 rounded-2xl bg-gold text-black shadow-map"
            >
              <Megaphone size={22} />
              <span className="text-[11px] font-bold">Avisar</span>
            </button>
          )}
          {/* A comunidade foi recolhida para a folha de camadas. Este espelho
              invisível preserva o contrato de preferência sem poluir o mapa. */}
          <span className="hidden" aria-hidden="true">
            <LayerToggle
              active={camadas.comunidade}
              onClick={() => alternar("comunidade")}
              label="Outros motoqueiros"
              icon={<Layers size={14} />}
            />
            {camadas.comunidade ? `${riders.length} anjos` : "desativado"}
          </span>
        </div>

        {folha === "camadas" && (
          <MapLayersSheet
            onFechar={() => setFolha("nenhuma")}
            itens={[
              {
                chave: "riscos",
                rotulo: "Áreas de risco",
                ativa: showHeat,
                alternar: () => setShowHeat((v) => !v),
              },
              {
                chave: "ocorrencias",
                rotulo: "Ocorrências (acidentes, perigo, roubo)",
                ativa: showAlerts,
                alternar: () => setShowAlerts((v) => !v),
              },
              {
                chave: "anjos",
                rotulo: "Moto Anjos próximos",
                ativa: camadas.comunidade,
                alternar: () => alternar("comunidade"),
              },
              {
                chave: "apoio",
                rotulo: "Pontos de apoio e postos",
                ativa: showSupport,
                alternar: () => setShowSupport((v) => !v),
              },
              {
                chave: "transito",
                rotulo: "Trânsito",
                ativa: showTraffic,
                alternar: () => setShowTraffic((v) => !v),
              },
            ]}
          />
        )}

        {/* ---- Viagem Segura na Home (RC3) ---- */}
        {viagem.estado === "ocioso" && folha === "nenhuma" && (
          <ChamadaViagemSegura onAbrir={() => setFolha((f) => abrirFolha(f, "destino"))} />
        )}

        {viagem.estado === "ocioso" && folha === "nenhuma" && !sos.open && (
          <>
            <CommunityRadar
              alerts={alerts}
              loading={alertsLoading}
              error={alertsError}
              liveUpdates={liveUpdates}
              onOpen={() => {
                setSelectedAlertId(null);
                setFolha("avisos");
              }}
            />
            <button
              type="button"
              onClick={() => setFolha("avisar")}
              className={`absolute bottom-[calc(var(--ma-bottom)+8px)] left-3 right-[calc(50%+52px)] ${camada("painelInferior")} flex min-h-[64px] items-center justify-center gap-3 rounded-2xl bg-gold px-4 text-[17px] font-bold text-black shadow-map`}
            >
              <Megaphone size={24} /> Avisar perigo
            </button>
          </>
        )}

        {folha === "avisar" && !sos.open && (
          <CommunityReportSheet onPublish={publishRoadReport} onClose={() => setFolha("nenhuma")} />
        )}
        {folha === "avisos" && !sos.open && (
          <CommunityAlertsSheet
            alerts={alerts}
            loading={alertsLoading}
            error={alertsError}
            selectedId={selectedAlertId}
            onShowAll={() => setSelectedAlertId(null)}
            onRefresh={refreshAlerts}
            onReport={() => setFolha("avisar")}
            onClose={() => setFolha("nenhuma")}
          />
        )}

        {/* O copiloto acompanha a Home inteira, com ou sem viagem — menos
            durante a preparação, onde o painel ocupa a mesma faixa.
            Navegando, a linha do Copiloto vive DENTRO da telemetria; sobre o
            mapa só sobra o alerta real, quando existe. */}
        {folha === "nenhuma" && modoCockpit && aviso != null && (
          <CopilotCard
            aviso={aviso}
            titulo={alerts.find((a) => a.id === aviso.id)?.title}
            viagemAtiva={viagemAtiva}
            className={`absolute inset-x-3 ${
              modoCockpit
                ? "bottom-[calc(env(safe-area-inset-bottom)+116px)]"
                : "bottom-[calc(var(--ma-bottom)+112px)]"
            }`}
          />
        )}

        {viagem.estado === "preparando" && folha !== "destino" && (
          <PreparacaoDeViagem
            viagem={viagem}
            gpsOk={!!position}
            contato={contactsLoading ? "Consultando contatos…" : (contacts[0]?.name ?? null)}
            compartilhando={sharingState.sharing}
            compartilhamentoConfirmado={sharingState.confirmed}
            segundoPlano={segundoPlanoNaPreparacao}
            rota={rota}
            estadoDaRota={estadoDaRota}
            onIniciar={iniciar}
            onCancelar={cancelar}
          />
        )}

        {modoCockpit && (
          <CockpitDeViagem
            viagem={viagem}
            velocidade={velocidade}
            rumo={rumo}
            inclinacao={inclinacao}
            modo={modo}
            proximoEvento={aviso}
            restanteKm={rota?.distanciaKm ?? null}
            etaMin={rota?.duracaoMin ?? null}
            copiloto={textoDoCopiloto}
            copilotoCritico={aviso != null}
            vozLigada={vozLigada}
            vozSuportada={vozSuportada}
            onAlternarVoz={alternarVoz}
            onDaisyCommand={onDaisyCommand}
            onFinalizar={() => finalizar(sosAtivo)}
            onSosHoldComplete={(heldMs) => sos.trigger(heldMs)}
            sosDisabled={sos.busy || sos.recovering}
          />
        )}

        {folha === "destino" && (
          <DestinoDialog
            onEscolher={(entrada) => {
              definirDestino(entrada, "manual");
              setFolha("nenhuma");
            }}
            onFechar={() => setFolha("nenhuma")}
          />
        )}

        {/* SOS da Home usa o controlador local compartilhado; nas demais abas o
            AppShell fornece o SOS global. O acionador captura GPS no toque. */}
        <SosFabControlado
          sos={sos}
          compact={modoCockpit}
          oculto={modoCockpit || !sosFlutuanteVisivel(folha, tecladoAberto)}
        />
      </div>
    </AppShell>
  );
}

function LayerToggle({
  active,
  onClick,
  label,
  icon,
  destaque = false,
  discreto = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
  /** Controle essencial da navegação: continua cheio mesmo em viagem. */
  destaque?: boolean;
  /** Controle secundário: mesma área de toque, menos peso visual. */
  discreto?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-map-panel/88 shadow-map backdrop-blur-xl transition ${
        active ? "text-gold" : "text-muted-foreground"
      } ${destaque ? "ring-1 ring-gold/20" : ""} ${discreto ? "border border-white/10" : ""}`}
    >
      {icon}
    </button>
  );
}
