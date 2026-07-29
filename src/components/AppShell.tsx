import type { ReactNode } from "react";
import { BottomNavigation } from "./BottomNavigation";

export function AppShell({
  children,
  hideNav = false,
}: {
  children: ReactNode;
  hideNav?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background pb-24">
      {children}
      {!hideNav && <BottomNavigation />}
    </div>
  );
}