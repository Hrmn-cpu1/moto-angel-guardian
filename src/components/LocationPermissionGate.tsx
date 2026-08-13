import { useEffect, useState } from "react";
import { MapPin, ShieldAlert, Loader2, Crosshair, Settings } from "lucide-react";
import { GoldButton } from "./GoldButton";
import { OutlineButton } from "./OutlineButton";
import { useLocationPermission } from "@/hooks/useLocationPermission";
import { abrirConfiguracoesDoApp, ofereceConfiguracoes } from "@/lib/location-permission";

interface Props {
  onGranted: () => void;
}

/**
 * Onboarding de localização.
 *
 * O estado NÃO mora mais aqui: vem de `useLocationPermission`, que consulta a
 * plataforma e guarda o resultado no módulo. Era isso que fazia o onboarding
 * reaparecer ao trocar de aba mesmo com a permissão já concedida.
 */
export function LocationPermissionGate({ onGranted }: Props) {
  const { status, concedida, verificando, pedir } = useLocationPermission();
  const [pedindo, setPedindo] = useState(false);
  const [instrucoes, setInstrucoes] = useState<string | null>(null);

  useEffect(() => {
    if (concedida) onGranted();
  }, [concedida, onGranted]);

  const solicitar = async () => {
    setPedindo(true);
    setInstrucoes(null);
    try {
      await pedir();
    } finally {
      setPedindo(false);
    }
  };

  const irParaConfiguracoes = async () => {
    const abriu = await abrirConfiguracoesDoApp();
    if (!abriu) {
      setInstrucoes(
        "Abra Configurações do aparelho > Aplicativos > Moto Anjo > Permissões > Localização > Permitir.",
      );
    }
  };

  if (concedida || verificando) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-xs uppercase tracking-widest text-gold">
        <Loader2 size={14} className="animate-spin" /> Verificando permissões...
      </div>
    );
  }

  const bloqueada = status === "negada" || status === "negada_permanente";
  const indisponivel = status === "indisponivel";
  const mostrarConfiguracoes = ofereceConfiguracoes(status);

  return (
    <div className="animate-fade-up px-5 pt-4">
      <div className="glass-card rounded-3xl p-6">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full border ${
                bloqueada
                  ? "border-emergency/40 bg-emergency/5 text-emergency"
                  : "border-gold/30 bg-gold/5 text-gold"
              }`}
            >
              {bloqueada ? <ShieldAlert size={32} /> : <MapPin size={32} />}
            </div>
            {!bloqueada && (
              <div className="absolute inset-0 animate-ping rounded-full bg-gold/10" />
            )}
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {mostrarConfiguracoes
              ? "Permissão bloqueada no aparelho"
              : bloqueada
                ? "Permissão negada"
                : indisponivel
                  ? "Não suportado"
                  : "Localização precisa"}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            {mostrarConfiguracoes
              ? "Libere a localização nas configurações"
              : bloqueada
                ? "Precisamos tentar de novo"
                : indisponivel
                  ? "Seu dispositivo não expõe GPS"
                  : "Precisamos da sua localização"}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {mostrarConfiguracoes
              ? "O aparelho não vai perguntar de novo enquanto a permissão estiver bloqueada. Abra as configurações do Moto Anjo e libere a localização."
              : bloqueada
                ? "Sem localização, o mapa e o SOS não conseguem dizer onde você está. Toque abaixo para permitir."
                : indisponivel
                  ? "Não conseguimos acessar o GPS aqui. Abra o Moto Anjo no celular com a localização ligada."
                  : "O mapa usa GPS de alta precisão para mostrar sua posição, pontos de apoio próximos e enviar sua localização exata no SOS."}
          </p>

          {instrucoes && <p className="mt-3 text-[11px] text-gold">{instrucoes}</p>}

          <ul className="mt-5 w-full space-y-2 text-left">
            {[
              "Mapa em tempo real com sua posição",
              "Hospitais, postos e oficinas ao redor",
              "SOS envia coordenadas exatas aos contatos",
            ].map((it) => (
              <li
                key={it}
                className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs text-foreground/80"
              >
                <Crosshair size={12} className="text-gold" /> {it}
              </li>
            ))}
          </ul>

          <div className="mt-6 w-full space-y-2">
            {!indisponivel && (
              <GoldButton onClick={() => void solicitar()} disabled={pedindo}>
                {pedindo ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Solicitando...
                  </>
                ) : bloqueada ? (
                  <>
                    <Crosshair size={14} /> Tentar novamente
                  </>
                ) : (
                  <>
                    <MapPin size={14} /> Permitir localização
                  </>
                )}
              </GoldButton>
            )}
            {mostrarConfiguracoes && (
              <OutlineButton size="sm" onClick={() => void irParaConfiguracoes()}>
                <Settings size={14} /> Abrir configurações
              </OutlineButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
