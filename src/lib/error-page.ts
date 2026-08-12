/**
 * Página de erro do servidor.
 *
 * Era a única tela do produto em tema claro: fundo #fafafa, texto #111. Num
 * app que é escuro por identidade, isso aparece como um flash branco na cara
 * de alguém que provavelmente está na rua, de capacete, com o sol batendo —
 * e num momento em que algo já deu errado. Agora segue a paleta do app.
 *
 * HTML puro de propósito: esta página existe justamente para quando o React
 * não subiu. Sem dependência, sem fonte externa, sem stack trace para o
 * usuário. As cores são literais porque as variáveis do Tailwind não existem
 * aqui.
 */
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Não foi possível carregar</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="dark" />
    <meta name="theme-color" content="#050505" />
    <style>
      :root { color-scheme: dark; }
      html, body { background: #050505; }
      body {
        font: 15px/1.6 system-ui, -apple-system, sans-serif;
        color: #f5f5f5;
        display: grid;
        place-items: center;
        min-height: 100vh;
        min-height: 100dvh;
        margin: 0;
        padding: calc(1.5rem + env(safe-area-inset-top)) 1.5rem calc(1.5rem + env(safe-area-inset-bottom));
      }
      .card {
        max-width: 28rem;
        width: 100%;
        text-align: center;
        padding: 2rem 1.5rem;
        border: 1px solid rgba(212, 175, 55, 0.25);
        border-radius: 1.5rem;
        background: rgba(255, 255, 255, 0.03);
      }
      .mark { font-size: 0.65rem; letter-spacing: 0.22em; text-transform: uppercase; color: #d4af37; margin: 0 0 0.75rem; }
      h1 { font-size: 1.15rem; margin: 0 0 0.5rem; color: #f5f5f5; }
      p { color: #a1a1a1; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button {
        padding: 0.7rem 1.15rem;
        border-radius: 999px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
        border: 1px solid transparent;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
      }
      .primary { background: linear-gradient(135deg, #d4af37, #b8912a); color: #050505; }
      .secondary { background: transparent; color: #d4af37; border-color: rgba(212, 175, 55, 0.4); }
    </style>
  </head>
  <body>
    <div class="card">
      <p class="mark">Moto Anjo</p>
      <h1>Não foi possível carregar esta tela</h1>
      <p>Algo falhou do nosso lado. Tente novamente ou volte para o início.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Tentar de novo</button>
        <a class="secondary" href="/">Ir para o início</a>
      </div>
    </div>
  </body>
</html>`;
}
