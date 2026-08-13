/// <reference types="google.maps" />
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { DARK_STYLE, RISK_BANDS, loadGoogleMaps } from "@/components/RealMap";

/**
 * PÁGINA TEMPORÁRIA DE DIAGNÓSTICO — /map-debug
 *
 * Não faz parte do produto. Existe só para achar a causa do "mapa preto" sem
 * chutar. Nada aqui toca Auth, SOS, Supabase, RLS, migrations ou WhatsApp:
 * é uma rota pública isolada que monta o Google Maps do zero.
 *
 * Regra do teste: NÍVEL 0 é `new google.maps.Map(container, { center, zoom,
 * mapTypeId: ROADMAP })` e mais nada — sem DARK_STYLE, sem backgroundColor,
 * sem trânsito, sem círculos, sem POIs, sem riders, sem parceiros, sem
 * overlays. Cada nível seguinte reativa UMA camada. O primeiro nível que
 * apagar o mapa é a causa.
 *
 * O seletor de LAYOUT é a segunda metade do teste: o mesmo mapa é montado
 * (a) num container com altura fixa e (b) na mesma estrutura de CSS que o
 * Dashboard usa hoje (`min-h-screen` no pai + `h-full` no filho). Se o mapa
 * aparecer em (a) e ficar preto em (b), a causa é altura de container, não o
 * Google Maps.
 */

const CENTRO_PADRAO = { lat: -23.55052, lng: -46.633308 };

const NIVEIS = [
  { id: 0, nome: "0 · Mapa padrão (nada aplicado)" },
  { id: 1, nome: "1 · + sua posição (marcador + círculo)" },
  { id: 2, nome: "2 · + estilo escuro (DARK_STYLE)" },
  { id: 3, nome: "3 · + trânsito" },
  { id: 4, nome: "4 · + círculos de risco" },
  { id: 5, nome: "5 · + alertas" },
  { id: 6, nome: "6 · + riders" },
  { id: 7, nome: "7 · + parceiros" },
] as const;

function classesDe(el: Element): string {
  const c = typeof el.className === "string" ? el.className : "";
  const partes = c.trim().split(/\s+/).filter(Boolean).slice(0, 4);
  return partes.length ? "." + partes.join(".") : "";
}

function descreve(el: Element): string {
  return `<${el.tagName.toLowerCase()}${classesDe(el)}>`;
}

function MapDebugPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const criadoEmRef = useRef<number>(0);
  const centroRef = useRef(CENTRO_PADRAO);
  const eventosRef = useRef<string[]>([]);
  const consoleRef = useRef<string[]>([]);
  const authFalhouRef = useRef(false);

  const [nivel, setNivel] = useState<number>(0);
  const [layout, setLayout] = useState<"fixo" | "app">("fixo");
  const [relatorio, setRelatorio] = useState<string>("");
  const [copiado, setCopiado] = useState(false);

  const chavePropria = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const chaveGerenciada = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as
    | string
    | undefined;
  const chave = (chavePropria && chavePropria.trim()) || chaveGerenciada;
  const origemChave =
    chavePropria && chavePropria.trim() ? "própria" : chaveGerenciada ? "gerenciada" : "nenhuma";

  // Captura mensagens do Google sem precisar de DevTools (o celular não tem).
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;
    const captura =
      (nivelLog: string, original: (...a: unknown[]) => void) =>
      (...args: unknown[]) => {
        const texto = args.map((a) => String(a)).join(" ");
        if (/google|maps|tile|billing|referer|api/i.test(texto)) {
          consoleRef.current.push(`${nivelLog}: ${texto.slice(0, 240)}`);
        }
        original(...args);
      };
    console.error = captura("console.error", originalError as (...a: unknown[]) => void);
    console.warn = captura("console.warn", originalWarn as (...a: unknown[]) => void);

    const w = window as unknown as { gm_authFailure?: () => void };
    const anterior = w.gm_authFailure;
    w.gm_authFailure = () => {
      authFalhouRef.current = true;
      consoleRef.current.push("gm_authFailure: DISPAROU (chave/referrer/billing recusados)");
      anterior?.();
    };

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      w.gm_authFailure = anterior;
    };
  }, []);

  // GPS só para centralizar — o teste não depende dele.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        centroRef.current = { lat: p.coords.latitude, lng: p.coords.longitude };
      },
      () => {},
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 },
    );
  }, []);

  // Monta o mapa do nível selecionado. A key do container força um <div> novo.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !chave) return;

    let cancelado = false;
    eventosRef.current = [];
    criadoEmRef.current = Date.now();

    loadGoogleMaps(chave)
      .then((g) => {
        if (cancelado || !containerRef.current) return;

        // NÍVEL 0: só isto. Nenhuma outra opção, nenhum estilo.
        const opcoes: google.maps.MapOptions = {
          center: centroRef.current,
          zoom: 15,
          mapTypeId: g.maps.MapTypeId.ROADMAP,
        };
        if (nivel >= 2) opcoes.styles = DARK_STYLE;

        const map = new g.maps.Map(containerRef.current, opcoes);
        mapRef.current = map;

        const marcarEvento = (nome: string) => {
          eventosRef.current.push(`${nome} em ${Date.now() - criadoEmRef.current} ms`);
        };
        g.maps.event.addListenerOnce(map, "tilesloaded", () => marcarEvento("tilesloaded"));
        g.maps.event.addListenerOnce(map, "idle", () => marcarEvento("idle"));
        g.maps.event.addListenerOnce(map, "bounds_changed", () => marcarEvento("bounds_changed"));

        const centro = centroRef.current;

        if (nivel >= 1) {
          class MarcadorUsuario extends g.maps.OverlayView {
            private el: HTMLDivElement | null = null;
            onAdd() {
              const el = document.createElement("div");
              el.className = "moto-user-location-marker";
              el.innerHTML =
                '<span class="moto-user-location-marker__pulse"></span><span class="moto-user-location-marker__pin"><span></span></span>';
              this.el = el;
              this.getPanes()?.overlayMouseTarget.appendChild(el);
            }
            draw() {
              const proj = this.getProjection();
              if (!proj || !this.el) return;
              const p = proj.fromLatLngToDivPixel(new g.maps.LatLng(centro.lat, centro.lng));
              if (p) this.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
            }
            onRemove() {
              this.el?.remove();
              this.el = null;
            }
          }
          new MarcadorUsuario().setMap(map);
          new g.maps.Circle({
            map,
            center: centro,
            radius: 40,
            strokeColor: "#D4AF37",
            strokeOpacity: 0.6,
            strokeWeight: 1,
            fillColor: "#D4AF37",
            fillOpacity: 0.08,
            clickable: false,
          });
        }

        if (nivel >= 3) new g.maps.TrafficLayer().setMap(map);

        if (nivel >= 4) {
          [
            { lat: centro.lat + 0.004, lng: centro.lng + 0.004 },
            { lat: centro.lat - 0.003, lng: centro.lng - 0.002 },
          ].forEach((ponto) => {
            RISK_BANDS.forEach((faixa) => {
              new g.maps.Circle({
                map,
                center: ponto,
                radius: 600 * faixa.scale,
                strokeWeight: 0,
                fillColor: faixa.color,
                fillOpacity: faixa.opacity,
                clickable: false,
                zIndex: 1,
              });
            });
          });
        }

        if (nivel >= 5) {
          [0.002, -0.002, 0.0035].forEach((d, i) => {
            new g.maps.Marker({
              map,
              position: { lat: centro.lat + d, lng: centro.lng - d },
              title: `alerta ${i + 1}`,
              zIndex: 20,
            });
          });
        }

        const montaOverlayDom = (classe: string, html: string, pos: google.maps.LatLngLiteral) => {
          class OverlayDom extends g.maps.OverlayView {
            private el: HTMLDivElement | null = null;
            onAdd() {
              const el = document.createElement("div");
              el.className = classe;
              el.innerHTML = html;
              this.el = el;
              this.getPanes()?.overlayMouseTarget.appendChild(el);
            }
            draw() {
              const proj = this.getProjection();
              if (!proj || !this.el) return;
              const p = proj.fromLatLngToDivPixel(new g.maps.LatLng(pos.lat, pos.lng));
              if (p) this.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
            }
            onRemove() {
              this.el?.remove();
              this.el = null;
            }
          }
          new OverlayDom().setMap(map);
        };

        if (nivel >= 6) {
          [0.0015, -0.0025].forEach((d, i) =>
            montaOverlayDom(
              "moto-rider-marker",
              `<span class="moto-rider-marker__avatar">R${i + 1}</span><span class="moto-rider-marker__dot"></span>`,
              { lat: centro.lat - d, lng: centro.lng + d },
            ),
          );
        }

        if (nivel >= 7) {
          [0.003, -0.0018].forEach((d, i) =>
            montaOverlayDom(
              "moto-partner-marker",
              `<span class="moto-partner-marker__badge"><span class="moto-partner-marker__initial">P${i + 1}</span></span><span class="moto-partner-marker__tag">teste</span>`,
              { lat: centro.lat + d, lng: centro.lng + d },
            ),
          );
        }
      })
      .catch((e) => {
        consoleRef.current.push(`loadGoogleMaps rejeitou: ${String(e)}`);
      });

    return () => {
      cancelado = true;
      mapRef.current = null;
    };
  }, [nivel, layout, chave]);

  const coletar = useCallback(() => {
    const container = containerRef.current;
    const linhas: string[] = [];
    const g = (window as unknown as { google?: typeof google }).google;

    linhas.push(`MOTO ANJO — DIAGNÓSTICO DO MAPA`);
    linhas.push(`quando: ${new Date().toISOString()}`);
    linhas.push(`origem: ${window.location.origin}`);
    linhas.push(`nível: ${NIVEIS[nivel].nome}`);
    linhas.push(
      `layout: ${layout === "fixo" ? "container com altura fixa" : "igual ao Dashboard (min-h + h-full)"}`,
    );
    linhas.push(`userAgent: ${navigator.userAgent.slice(0, 160)}`);
    linhas.push(`devicePixelRatio: ${window.devicePixelRatio}`);
    linhas.push("");

    linhas.push("— CHAVE E API —");
    linhas.push(
      `chave presente: ${chave ? "sim" : "NÃO"} (origem: ${origemChave}, ${chave ? chave.length : 0} caracteres — valor não exibido)`,
    );
    const scripts = Array.from(document.querySelectorAll("script")).filter((s) =>
      s.src.includes("maps.googleapis.com"),
    );
    linhas.push(
      `script maps/api/js no DOM: ${scripts.length > 0 ? "sim" : "NÃO"} (${scripts.length})`,
    );
    linhas.push(`window.google.maps disponível: ${g?.maps ? "sim" : "NÃO"}`);
    linhas.push(`versão da Maps JS: ${g?.maps?.version ?? "—"}`);
    linhas.push(`gm_authFailure disparou: ${authFalhouRef.current ? "SIM" : "não"}`);
    linhas.push(
      `eventos: ${eventosRef.current.length ? eventosRef.current.join(" | ") : "NENHUM (nem tilesloaded, nem idle)"}`,
    );
    linhas.push("");

    linhas.push("— CONTAINER E ANCESTRAIS —");
    if (!container) {
      linhas.push("container: NÃO ENCONTRADO");
    } else {
      let node: HTMLElement | null = container;
      let i = 0;
      while (node && i < 10) {
        const cs = getComputedStyle(node);
        const r = node.getBoundingClientRect();
        linhas.push(
          `${i === 0 ? "container" : `ancestral ${i}`} ${descreve(node)} ${Math.round(r.width)}x${Math.round(r.height)}px · position=${cs.position} · display=${cs.display} · height=${cs.height} · bg=${cs.backgroundColor} · opacity=${cs.opacity} · filter=${cs.filter} · blend=${cs.mixBlendMode} · z=${cs.zIndex} · overflow=${cs.overflow} · visibility=${cs.visibility}`,
        );
        for (const pe of ["::before", "::after"]) {
          const p = getComputedStyle(node, pe);
          const temFundo =
            p.backgroundColor !== "rgba(0, 0, 0, 0)" && p.backgroundColor !== "transparent";
          if (p.content !== "none" && (temFundo || p.position === "absolute")) {
            linhas.push(
              `   ${pe}: content=${p.content} bg=${p.backgroundColor} position=${p.position} inset=${p.inset} z=${p.zIndex}`,
            );
          }
        }
        node = node.parentElement;
        i++;
      }

      const r = container.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        linhas.push("");
        linhas.push(">>> CONTAINER COM TAMANHO ZERO. O Google Maps não tem onde desenhar. <<<");
      }

      linhas.push("");
      linhas.push("— O QUE ESTÁ POR CIMA DO CENTRO DO MAPA —");
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const pilha = document.elementsFromPoint(cx, cy);
      if (!pilha.length) {
        linhas.push("nada retornado (container fora da tela?)");
      } else {
        pilha.slice(0, 8).forEach((el, idx) => {
          const cs = getComputedStyle(el);
          linhas.push(
            `${idx}: ${descreve(el)} bg=${cs.backgroundColor} opacity=${cs.opacity} z=${cs.zIndex}`,
          );
        });
        const topo = pilha[0];
        const dentro = container.contains(topo);
        linhas.push(
          dentro
            ? "topo da pilha está DENTRO do mapa (sem camada cobrindo)"
            : ">>> TOPO DA PILHA ESTÁ FORA DO MAPA — existe camada cobrindo os tiles <<<",
        );
      }

      linhas.push("");
      linhas.push("— TILES —");
      const gmStyle = container.querySelector(".gm-style");
      linhas.push(`.gm-style existe: ${gmStyle ? "sim" : "NÃO"}`);
      if (gmStyle) {
        const rg = gmStyle.getBoundingClientRect();
        const cg = getComputedStyle(gmStyle);
        linhas.push(
          `.gm-style: ${Math.round(rg.width)}x${Math.round(rg.height)}px bg=${cg.backgroundColor} opacity=${cg.opacity} visibility=${cg.visibility}`,
        );
      }
      const imgs = Array.from(container.querySelectorAll("img"));
      const canvases = container.querySelectorAll("canvas");
      linhas.push(`imagens de tile no DOM: ${imgs.length} · canvas: ${canvases.length}`);
      const primeira = imgs.find(
        (im) => im.src.includes("googleapis") || im.src.includes("gstatic"),
      );
      if (primeira) {
        const cs = getComputedStyle(primeira);
        linhas.push(
          `1ª tile: natural=${primeira.naturalWidth}x${primeira.naturalHeight} render=${Math.round(primeira.getBoundingClientRect().width)}x${Math.round(primeira.getBoundingClientRect().height)} complete=${primeira.complete} max-width=${cs.maxWidth} height=${cs.height} opacity=${cs.opacity} visibility=${cs.visibility} display=${cs.display}`,
        );
        if (cs.maxWidth === "100%") {
          linhas.push(">>> ATENÇÃO: max-width:100% aplicado às tiles (preflight do Tailwind). <<<");
        }
        if (primeira.complete && primeira.naturalWidth === 0) {
          linhas.push(">>> ATENÇÃO: tile baixou mas naturalWidth=0 (imagem não decodificou). <<<");
        }
      } else if (imgs.length === 0) {
        linhas.push("nenhuma <img> de tile foi inserida no DOM");
      }
    }

    linhas.push("");
    linhas.push("— MENSAGENS DO GOOGLE CAPTURADAS —");
    linhas.push(consoleRef.current.length ? consoleRef.current.slice(-12).join("\n") : "nenhuma");

    setRelatorio(linhas.join("\n"));
    setCopiado(false);
  }, [chave, layout, nivel, origemChave]);

  // Coleta sozinho 3 s depois de montar cada nível (celular lento).
  useEffect(() => {
    const t = setTimeout(coletar, 3000);
    return () => clearTimeout(t);
  }, [coletar]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(relatorio);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  const chaveMapa = `${nivel}-${layout}`;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background px-4 py-5 text-foreground">
      <h1 className="text-base font-bold text-gold">Diagnóstico do mapa</h1>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Página temporária. Suba do nível 0 e pare no primeiro nível em que o mapa apagar — esse é o
        culpado. Depois repita trocando o layout.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {NIVEIS.map((n) => (
          <button
            key={n.id}
            onClick={() => setNivel(n.id)}
            className={`rounded-xl border px-2 py-2 text-left text-[11px] font-semibold ${
              nivel === n.id
                ? "border-gold bg-gold/15 text-gold"
                : "border-white/10 bg-black/40 text-muted-foreground"
            }`}
          >
            {n.nome}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => setLayout("fixo")}
          className={`rounded-xl border px-2 py-2 text-[11px] font-semibold ${
            layout === "fixo"
              ? "border-gold bg-gold/15 text-gold"
              : "border-white/10 bg-black/40 text-muted-foreground"
          }`}
        >
          Layout A · altura fixa
        </button>
        <button
          onClick={() => setLayout("app")}
          className={`rounded-xl border px-2 py-2 text-[11px] font-semibold ${
            layout === "app"
              ? "border-gold bg-gold/15 text-gold"
              : "border-white/10 bg-black/40 text-muted-foreground"
          }`}
        >
          Layout B · igual ao Dashboard
        </button>
      </div>

      {!chave && (
        <p className="mt-3 rounded-xl border border-emergency/40 bg-emergency/10 p-3 text-[11px] text-emergency">
          Nenhuma chave do Google Maps no build. O teste não pode rodar — isso já é a resposta.
        </p>
      )}

      {/* Layout A: container com altura própria, fora de qualquer truque de CSS. */}
      {layout === "fixo" ? (
        <div className="mt-4 rounded-xl border border-gold/30 p-1">
          <div key={chaveMapa} ref={containerRef} style={{ width: "100%", height: 320 }} />
        </div>
      ) : (
        // Layout B: reproduz EXATAMENTE a estrutura do Dashboard hoje —
        // pai com min-height (sem height) e filho com h-full + absolute inset-0.
        <div className="relative mt-4 min-h-[320px] w-full overflow-hidden border border-emergency/30 bg-background">
          <div className="relative h-full w-full absolute inset-0">
            <div key={chaveMapa} ref={containerRef} className="absolute inset-0 h-full w-full" />
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={coletar}
          className="rounded-xl gold-gradient px-3 py-2.5 text-xs font-bold text-black"
        >
          Coletar diagnóstico
        </button>
        <button
          onClick={() => void copiar()}
          className="rounded-xl border border-gold/40 px-3 py-2.5 text-xs font-bold text-gold"
        >
          {copiado ? "Copiado!" : "Copiar relatório"}
        </button>
      </div>

      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/60 p-3 text-[10px] leading-relaxed text-muted-foreground">
        {relatorio || "Toque em Coletar diagnóstico."}
      </pre>
    </div>
  );
}

export const Route = createFileRoute("/map-debug")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Diagnóstico do mapa — Moto Anjo" }, { name: "robots", content: "noindex" }],
  }),
  component: MapDebugPage,
});
