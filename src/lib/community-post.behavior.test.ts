import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  single: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

import { mensagemErroPublicacao, publicarNaComunidade, validarPublicacao } from "./community-post";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "u1", email: "piloto@moto.com" } },
    error: null,
  });
  mocks.single.mockResolvedValue({
    data: {
      id: "p1",
      user_id: "u1",
      author_name: "Piloto",
      category: "Dicas",
      region: "Curitiba, PR",
      text: "Cuidado na BR-116",
      created_at: "2026-09-08T20:00:00Z",
    },
    error: null,
  });
  mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
  mocks.from.mockReturnValue({ insert: mocks.insert });
});

test("texto vazio ou curto não é enviado", async () => {
  expect(validarPublicacao("")).toBeTruthy();
  expect(validarPublicacao(" a ")).toBeTruthy();
  expect(validarPublicacao("ok")).toBeNull();
  await expect(
    publicarNaComunidade({ text: "  ", category: "Geral", region: "" }),
  ).rejects.toThrow();
  expect(mocks.insert).not.toHaveBeenCalled();
});

test("grava com o usuário da sessão e devolve o registro criado", async () => {
  const row = await publicarNaComunidade({
    text: "  Cuidado na BR-116 ",
    category: "Dicas",
    region: " Curitiba, PR ",
    authorName: "Piloto",
  });
  expect(mocks.from).toHaveBeenCalledWith("community_posts");
  expect(mocks.insert).toHaveBeenCalledWith({
    user_id: "u1",
    author_name: "Piloto",
    category: "Dicas",
    region: "Curitiba, PR",
    text: "Cuidado na BR-116",
  });
  expect(row.id).toBe("p1");
});

test("sem sessão ativa avisa em vez de falhar em silêncio", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(publicarNaComunidade({ text: "teste", category: "Geral", region: "" })).rejects.toThrow(
    /sessão expirou/i,
  );
  expect(mocks.insert).not.toHaveBeenCalled();
});

test("recusa por regra de acesso vira mensagem específica", async () => {
  mocks.single.mockResolvedValue({
    data: null,
    error: { code: "42501", message: "new row violates row-level security policy" },
  });
  await expect(publicarNaComunidade({ text: "teste", category: "Geral", region: "" })).rejects.toThrow(
    /Sem permissão/i,
  );
});

describe("tradução de erros", () => {
  test("cada tipo de falha tem mensagem própria", () => {
    expect(mensagemErroPublicacao({ code: "42501" })).toMatch(/Sem permissão/i);
    expect(mensagemErroPublicacao({ code: "PGRST301" })).toMatch(/sessão expirou/i);
    expect(mensagemErroPublicacao({ code: "23502", message: "null value" })).toMatch(/Confira os campos/i);
    expect(mensagemErroPublicacao({ message: "Failed to fetch" })).toMatch(/Sem conexão/i);
  });
});
