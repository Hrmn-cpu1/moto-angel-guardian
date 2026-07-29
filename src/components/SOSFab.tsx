import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

export function SOSFab() {
  return (
    <Link
      to="/sos"
      className="fixed bottom-24 right-4 z-50 flex h-16 w-16 items-center justify-center rounded-full text-white animate-pulse-emergency"
      style={{
        background:
          "radial-gradient(circle at 30% 30%, oklch(0.7 0.24 26), oklch(0.45 0.24 26))",
      }}
      aria-label="SOS Emergência"
    >
      <div className="flex flex-col items-center leading-none">
        <AlertTriangle size={20} />
        <span className="mt-0.5 text-[10px] font-black tracking-widest">SOS</span>
      </div>
    </Link>
  );
}