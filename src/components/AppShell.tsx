import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BottomNavigation } from "./BottomNavigation";
import { useAuth } from "@/hooks/useAuth";
import { isTermsAccepted } from "@/lib/terms";

export function AppShell({
  children,
  hideNav = false,
}: {
  children: ReactNode;
  hideNav?: boolean;
}) {
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background pb-24">
      {children}
      {!hideNav && <BottomNavigation />}
    </div>
  );
}
