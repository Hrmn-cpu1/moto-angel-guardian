export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  bikeModel: string;
  plate: string;
  bloodType: string;
  emergencyContact: string;
  emergencyPhone: string;
  avatar?: string;
  createdAt: string;
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