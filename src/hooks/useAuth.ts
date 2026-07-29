import { useCallback, useEffect, useState } from "react";
import { storage, STORAGE_KEYS } from "../lib/storage";
import type { Session, User } from "../types";

const DEMO_USER: User = {
  id: "demo-user",
  name: "Motociclista Demo",
  email: "demo@motoanjo.com",
  phone: "+55 11 90000-0000",
  password: "123456",
  bikeModel: "Honda CB 500X",
  plate: "MTA-2026",
  bloodType: "O+",
  emergencyContact: "Ana Souza",
  emergencyPhone: "+55 11 98888-8888",
  createdAt: new Date().toISOString(),
};

function ensureDemoUser() {
  const users = storage.get<User[]>(STORAGE_KEYS.users, []);
  if (!users.find((u) => u.email === DEMO_USER.email)) {
    storage.set(STORAGE_KEYS.users, [DEMO_USER, ...users]);
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ensureDemoUser();
    const session = storage.get<Session | null>(STORAGE_KEYS.session, null);
    if (session) {
      const users = storage.get<User[]>(STORAGE_KEYS.users, []);
      const found = users.find((u) => u.id === session.userId);
      if (found) setUser(found);
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    ensureDemoUser();
    const users = storage.get<User[]>(STORAGE_KEYS.users, []);
    const found = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
    );
    if (!found) throw new Error("E-mail ou senha inválidos.");
    storage.set<Session>(STORAGE_KEYS.session, {
      userId: found.id,
      loggedInAt: new Date().toISOString(),
    });
    setUser(found);
    return found;
  }, []);

  const register = useCallback(async (data: Omit<User, "id" | "createdAt">) => {
    const users = storage.get<User[]>(STORAGE_KEYS.users, []);
    if (users.find((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
      throw new Error("Já existe uma conta com este e-mail.");
    }
    const newUser: User = {
      ...data,
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    storage.set(STORAGE_KEYS.users, [newUser, ...users]);
    storage.set<Session>(STORAGE_KEYS.session, {
      userId: newUser.id,
      loggedInAt: new Date().toISOString(),
    });
    setUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(() => {
    storage.remove(STORAGE_KEYS.session);
    setUser(null);
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      const users = storage.get<User[]>(STORAGE_KEYS.users, []);
      storage.set(
        STORAGE_KEYS.users,
        users.map((u) => (u.id === updated.id ? updated : u)),
      );
      return updated;
    });
  }, []);

  return { user, loading, login, register, logout, updateUser };
}