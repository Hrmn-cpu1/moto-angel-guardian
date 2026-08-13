import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Crosshair, Fuel, Layers, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { HomeTopBar } from "@/components/HomeTopBar";
import { SosFab } from "@/components/SosFab";
import { DestinationBar } from "@/components/DestinationBar";
import { CopilotCard } from "@/components/CopilotCard";
import { MapLayersSheet } from "@/components/MapLayersSheet";
import { LocationPermissionGate } from "@/components/LocationPermissionGate";
import { useLocationPermission } from "@/hooks/useLocationPermission";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAlerts } from "@/hooks/useAlerts";
import { useNearbyRiders } from "@/hooks/useNearbyRiders";
import { useMapLayers } from "@/hooks/useMapLayers";
import { useTrip } from "@/hooks/useTrip";
import { useCockpitTelemetry } from "@/hooks/useCockpitTelemetry";
import { useSafetyCopilot } from "@/hooks/useSafetyCopilot";
import { useSosController } from "@/hooks/useSosController";
import {
  ChamadaViagemSegura,
  CockpitDeViagem,
  PreparacaoDeViagem,
} from "@/components/RideCockpit";
import { DestinoDialog } from "@/components/DestinoDialog";
import { NextManeuver } from "@/components/NextManeuver";
import { camada } from "@/lib/layers";
import { atualizarServicoDeViagem } from "@/lib/trip-service";
import { APARENCIA, distanciaCurta } from "@/lib/map-events";
import { useRiskZones } from "@/hooks/useRiskZones";
import { usePartners } from "@/hooks/usePartners";
import { useServerFn } from "@tanstack/react-start";
import { searchPOIs, type POI } from "@/lib/pois.functions";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { RouteInfo } from "@/components/RealMap";

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
  const [layersOpen, setLayersOpen] = useState(false);
  const [rota, setRota] = useState<RouteInfo | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const fetchPOIs = useServerFn(searchPOIs);
  const { alerts } = useAlerts(position);
  // Mesma fonte de verdade da tela /map (P0.5-B): mesma preferência, mesmas
  // regras de opt-in e a mesma separação entre comunidade e contatos.
  const { camadas, alternar } = useMapLayers();
  const { todos: riders, contatos, comunidade } = useNearbyRiders(position, 50, camadas);
  const { risks } = useRiskZones(position);

  // Viagem Segura: fonte única, no módulo. Trocar de aba não mata a viagem
  // (RC3 seções 8 e 39).
  const { viagem, definirDestino, iniciar, cancelar, finalizar } = useTrip();
  const viagemAtiva = viagem.estado === "ativa";
  const { velocidade, rumo, inclinacao, modo } = useCockpitTelemetry(viagemAtiva);
  const [buscandoDestino, setBuscandoDestino] = useState(false);
  // O SOS ativo é lido do controlador que já existe, pela fase — não invento
  // API nova nele (RC3: não reimplementar SOS).
  const sos = useSosController();
  // Um SOS existe no servidor a partir do registro: são as fases em que já
  // há sos_event_id. É isso que "finalizar viagem" não pode destruir.
  const sosAtivo =
    sos.phase === "aguardando_envio" ||
    sos.phase === "sem_contatos" ||
    sos.sosEventId != null;
  const { aviso, vozLigada, vozSuportada, alternarVoz } = useSafetyCopilot({
    alerts,
    pois,
    riders,
    viagemAtiva,
    modo,
  });
  const { located: locatedPartners } = usePartners();

  // A rota vem do Google pelo mapa; guardá-la aqui é o que permite mostrar
  // distância e ETA reais na faixa de destino.
  const aoCalcularRota = useCallback((r: RouteInfo | null) => setRota(r), []);

  // A notificação da viagem mostra o próximo alerta — é o que aparece na tela
  // de bloqueio. Só atualiza durante a viagem, e só quando o aviso muda.
  useEffect(() => {
    if (!viagemAtiva) return;
    void atualizarServicoDeViagem({
      alerta: aviso ? APARENCIA[aviso.categoria].rotulo : "",
      distancia: aviso ? distanciaCurta(aviso.distanciaKm) : "",
    });
  }, [viagemAtiva, aviso?.id, aviso?.categoria, aviso?.distanciaKm]);

  useEffect(() => {
    if (!granted) return;
    void capture();
    startWatch();
    return () => stopWatch();
  }, [granted, capture, startWatch, stopWatch]);

  useEffect(() => {
    if (!position || !showSupport) return;
    fetchPOIs({ data: { lat: position.lat, lng: position.lng, radius: 3000 } })
      .then((r) => setPois(r.pois))
      .catch((e) => console.error(e));
  }, [position, fetchPOIs, showSupport]);

  if (loading || !user) return <LoadingScreen />;

  if (!granted) {
    return (
      <AppShell>
        <div className="px-5 pt-8">
          <LocationPermissionGate onGranted={() => undefined} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fullBleed>
      <div className="relative h-[100dvh] min-h-screen w-full overflow-hidden bg-background">
        <ClientOnly
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-gold">
              Preparando mapa...
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-gold">
                Carregando mapa...
              </div>
            }
          >
            <RealMap
              center={position ? { lat: position.lat, lng: position.lng } : null}
              accuracy={position?.accuracy ?? null}
              follow={follow}
              zoom={16}
              rounded={false}
              showTraffic={showTraffic}
              showHeatmap={showHeat}
              riskPoints={risks}
              pois={showSupport ? pois : []}
              destination={
                viagem.destino
                  ? {
                      lat: viagem.destino.latitude,
                      lng: viagem.destino.longitude,
                      address: viagem.destino.address,
                    }
                  : null
              }
              onRoute={aoCalcularRota}
              alerts={
                showAlerts
                  ? alerts.map((a) => ({
                      id: a.id,
                      type: a.type,
                      title: a.title,
                      lat: a.lat,
                      lng: a.lng,
                    }))
                  : []
              }
              riders={riders.map((r) => ({
                id: r.user_id,
                name: r.name,
                avatarUrl: r.avatar_url,
                lat: r.lat,
                lng: r.lng,
              }))}
              partners={
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
                  : []
              }
              className="absolute inset-0"
            />
          </Suspense>
        </ClientOnly>

        {position && follow && (
          <div className="moto-user-location-marker left-1/2 top-1/2" aria-label="Sua localização">
            <span className="moto-user-location-marker__pulse" />
            <span className="moto-user-location-marker__pin">
              <span />
            </span>
          </div>
        )}

        <HomeTopBar
          gpsOnline={watching && !!position}
          copilotOnline={!!position}
          tripActive={viagemAtiva}
        />

        <DestinationBar
          viagem={viagem}
          rota={rota}
          onAbrirDestino={() => setBuscandoDestino(true)}
          onIniciar={iniciar}
        />

        {/* Próxima manobra: prioridade máxima durante a viagem. */}
        {viagemAtiva && <NextManeuver rota={rota} className="absolute inset-x-3 top-[124px]" />}

        {/* Controles do mapa: anjos, camadas, combustível e centralizar. */}
        <div
          className={`absolute right-3 ${
            viagemAtiva ? "top-[196px]" : "top-[148px]"
          } z-30 flex flex-col gap-2`}
        >
          <LayerToggle
            active={camadas.comunidade}
            onClick={() => alternar("comunidade")}
            label="Outros motoqueiros"
            icon={<Users size={14} />}
          />
          <LayerToggle
            active={layersOpen}
            onClick={() => setLayersOpen(true)}
            label="Camadas do mapa"
            icon={<Layers size={14} />}
          />
          <LayerToggle
            active={showSupport}
            onClick={() => setShowSupport((v) => !v)}
            label="Pontos de apoio"
            icon={<Fuel size={14} />}
          />
          <LayerToggle
            active={follow}
            onClick={() => {
              setFollow(true);
              void capture();
            }}
            label="Centralizar"
            icon={<Crosshair size={14} />}
          />
        </div>

        {/* Estado da camada de anjos: sem inventar ninguém no mapa.
            Durante a viagem some — quem pilota não precisa desse rótulo. */}
        {!viagemAtiva && (
          <div
            data-testid="estado-anjos"
            className={`absolute right-3 top-[112px] ${camada(
              "cartoesDoMapa",
            )} rounded-full border border-gold/25 bg-black/75 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest text-gold`}
          >
            Anjos ·{" "}
            {camadas.comunidade
              ? riders.length > 0
                ? `${riders.length}`
                : "ninguém agora"
              : "desativado"}
          </div>
        )}

        {layersOpen && (
          <MapLayersSheet
            onFechar={() => setLayersOpen(false)}
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
        {viagem.estado === "ocioso" && (
          <ChamadaViagemSegura onAbrir={() => setBuscandoDestino(true)} />
        )}

        {/* O copiloto acompanha a Home inteira, com ou sem viagem. */}
        <CopilotCard
          aviso={aviso}
          viagemAtiva={viagemAtiva}
          className={`absolute inset-x-3 ${
            viagemAtiva
              ? "bottom-[calc(env(safe-area-inset-bottom)+224px)]"
              : "bottom-[calc(env(safe-area-inset-bottom)+220px)]"
          }`}
        />

        {viagem.estado === "preparando" && (
          <PreparacaoDeViagem
            viagem={viagem}
            gpsOk={!!position}
            contato={null}
            onIniciar={iniciar}
            onCancelar={cancelar}
          />
        )}

        {viagemAtiva && (
          <CockpitDeViagem
            viagem={viagem}
            velocidade={velocidade}
            rumo={rumo}
            inclinacao={inclinacao}
            modo={modo}
            proximoEvento={aviso}
            vozLigada={vozLigada}
            vozSuportada={vozSuportada}
            onAlternarVoz={alternarVoz}
            onFinalizar={() => finalizar(sosAtivo)}
          />
        )}

        {buscandoDestino && (
          <DestinoDialog
            onEscolher={(entrada) => {
              definirDestino(entrada, "manual");
              setBuscandoDestino(false);
            }}
            onFechar={() => setBuscandoDestino(false)}
          />
        )}

        {/* Resumo: escondido durante a viagem, para não competir com o painel */}
        <div
          className={`absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+96px)] ${camada(
            "cartoesDoMapa",
          )} flex justify-between gap-2 text-[10px] font-semibold uppercase tracking-widest ${
            viagem.estado === "ocioso" ? "" : "hidden"
          }`}>
          <span className="rounded-full border border-gold/30 bg-black/75 px-3 py-1.5 text-gold">
            {camadas.comunidade
              ? `${contatos.length + comunidade.length} online`
              : `${contatos.length} contato${contatos.length === 1 ? "" : "s"}`}
          </span>
          <span className="rounded-full border border-emergency/40 bg-black/75 px-3 py-1.5 text-emergency">
            {alerts.length} ocorrências
          </span>
        </div>

        {/* Sem prop de posição: o SOS captura o GPS na hora do acionamento. */}
        <SosFab />
      </div>
    </AppShell>
  );
}

function LayerToggle({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition ${
        active
          ? "border-gold bg-gold/20 text-gold"
          : "border-white/10 bg-black/70 text-muted-foreground"
      }`}
    >
      {icon}
    </button>
  );
}
