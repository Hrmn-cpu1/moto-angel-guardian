import { Shield } from "lucide-react";

export function LoadingScreen({ label = "Carregando" }: { label?: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background">
      <div className="relative">
        <Shield className="text-gold" size={48} />
        <div className="absolute inset-0 animate-ping rounded-full bg-gold/20" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
