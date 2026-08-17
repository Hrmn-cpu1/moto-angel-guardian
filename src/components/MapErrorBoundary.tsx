import { Component, type ErrorInfo, type ReactNode } from "react";
import { MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { recordTripDiagnostic, registrarEventoDeViagem } from "@/lib/trip-diagnostics";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Mantém o cockpit utilizável quando somente o provedor visual do mapa falha. */
export class MapErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error);
    registrarEventoDeViagem("error.boundary", { detalhe: "map" });
    const diagnostic = recordTripDiagnostic("react.map_boundary", error);
    reportLovableError(error, {
      boundary: "dashboard_map_error_boundary",
      componentStack: info.componentStack ?? undefined,
      tripDiagnostic: diagnostic,
    });
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background px-8 text-center">
        <MapPin className="h-8 w-8 text-gold" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-foreground">Mapa temporariamente indisponível</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            O cockpit e o SOS continuam ativos. Tente carregar o mapa novamente.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={this.retry}>
          <RefreshCw aria-hidden="true" />
          Tentar novamente
        </Button>
      </div>
    );
  }
}
