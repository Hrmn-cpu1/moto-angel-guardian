export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  bikeModel: string;
  plate: string;
  bloodType: string;
  emergencyContact: string;
  emergencyPhone: string;
  avatar?: string;
  createdAt: string;
  /** ISO date/time when user accepted the current Terms of Use. */
  termsAcceptedAt?: string;
  /** Version of the Terms accepted by the user. */
  termsVersion?: string;
  /** Código único para convidar outros motociclistas. */
  referralCode?: string;
  /** ID do motociclista cujo código foi usado neste cadastro. */
  referredBy?: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  relation: string;
  isPrimary: boolean;
}

export interface HistoryItem {
  id: string;
  type: "trip" | "sos" | "share";
  title: string;
  description: string;
  timestamp: string;
  meta?: Record<string, string | number>;
}

export interface Trip {
  id: string;
  startedAt: string;
  endedAt: string;
  duration: number; // seconds
  distance: number; // km
  avgSpeed: number;
  companion?: string;
}

export interface Session {
  userId: string;
  loggedInAt: string;
}
