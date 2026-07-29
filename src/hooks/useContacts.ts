import { useCallback, useEffect, useState } from "react";
import { storage, STORAGE_KEYS } from "../lib/storage";
import type { Contact } from "../types";

const SEED: Contact[] = [
  { id: "c-1", name: "Ana Souza", phone: "+55 11 98888-8888", relation: "Esposa", isPrimary: true },
  { id: "c-2", name: "Carlos Lima", phone: "+55 11 97777-7777", relation: "Irmão", isPrimary: false },
];

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    const existing = storage.get<Contact[] | null>(STORAGE_KEYS.contacts, null);
    if (!existing) {
      storage.set(STORAGE_KEYS.contacts, SEED);
      setContacts(SEED);
    } else {
      setContacts(existing);
    }
  }, []);

  const persist = (next: Contact[]) => {
    storage.set(STORAGE_KEYS.contacts, next);
    setContacts(next);
  };

  const add = useCallback(
    (c: Omit<Contact, "id">) => {
      const next = [...contacts, { ...c, id: `c-${Date.now()}` }];
      persist(next);
    },
    [contacts],
  );

  const update = useCallback(
    (id: string, patch: Partial<Contact>) => {
      persist(contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    [contacts],
  );

  const remove = useCallback(
    (id: string) => {
      persist(contacts.filter((c) => c.id !== id));
    },
    [contacts],
  );

  const setPrimary = useCallback(
    (id: string) => {
      persist(contacts.map((c) => ({ ...c, isPrimary: c.id === id })));
    },
    [contacts],
  );

  return { contacts, add, update, remove, setPrimary };
}