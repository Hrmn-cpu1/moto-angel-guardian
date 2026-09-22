let owner: string | null = null;
export function protectionOwner(): string {
  if (!owner) throw new Error("Sessão de proteção indisponível.");
  return owner;
}
export function setProtectionOwner(userId: string): boolean {
  const changed = localStorage.getItem("moto-anjo:protection-owner") !== userId;
  if (changed) {
    localStorage.removeItem("moto-anjo:viagem");
    localStorage.removeItem("moto-anjo:sos-ativo");
    localStorage.removeItem("moto-anjo:sos-pendente");
    localStorage.setItem("moto-anjo:protection-owner", userId);
  }
  owner = userId;
  return changed;
}
