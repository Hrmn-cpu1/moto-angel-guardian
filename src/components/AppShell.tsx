import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BottomNavigation } from "./BottomNavigation";
import { SosFabControlado } from "./SosFab";
import { useAuth } from "@/hooks/useAuth";
import { useSosController } from "@/hooks/useSosController";
import { isTermsAccepted } from "@/lib/terms";

export type SosController = ReturnType<typeof useSosController>;

type AppShellProps = {
  children: ReactNode;
  hideNav?: boolean;
  /** Full-screen surfaces (map home) drop the bottom padding. */
  fullBleed?: boolean;
  /** Reuses the screen's SOS controller so there is only one controller per screen. */
  sos?: SosController;
  /** Hides the global SOS only when the current screen has a blocking sheet/keyboard. */
  sosOculto?: boolean;
  /** Uses the compact SOS treatment used by the navigation cockpit. */
  sosCompact?: boolean;
  /** Cockpit keeps the main navigation visible and centers SOS over it. */
  cockpit?: boolean;
};

/**
 * AppShell keeps the emergency trigger available on every authenticated tab.
 *
 * Screens that already own a SOS controller (currently Home) pass it through;
 * other screens get one controller owned by AppShell. This avoids creating two
 * realtime SOS controllers on the same screen.
 */
export function AppShell(props: AppShellProps) {
  if (props.sos) {
    return <AppShellFrame {...props} sos={props.sos} renderSos={false} />;
  }
  return <AppShellWithOwnSos {...props} />;
}

function AppShellWithOwnSos(props: AppShellProps) {
  const sos = useSosController();
  return <AppShellFrame {...props} sos={sos} renderSos />;
}

function AppShellFrame({
  children,
  hideNav = false,
  fullBleed = false,
  sos,
  sosOculto = false,
  sosCompact = false,
  cockpit = false,
  renderSos = true,
}: AppShellProps & { sos: SosController; renderSos: boolean }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // If the Terms of Use have been updated since the user last accepted,
  // force a re-acceptance before allowing access to the app.
  useEffect(() => {
    if (loading || !user) return;
    if (!isTermsAccepted(user)) {
      navigate({ to: "/terms", search: { accept: true } });
    }
  }, [user, loading, navigate]);

  return (
    <div
      className={`mx-auto flex min-h-[100dvh] max-w-md flex-col bg-background ${fullBleed ? "" : "pb-[calc(var(--ma-bottom)+1rem)]"}`}
    >
      {children}

      {renderSos && (
        <SosFabControlado
          sos={sos}
          compact={sosCompact}
          oculto={sosOculto}
        />
      )}

      {!hideNav && <BottomNavigation cockpit={cockpit} sos={sos} />}
    </div>
  );
}
