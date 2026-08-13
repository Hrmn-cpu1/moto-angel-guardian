import { useEffect, useState } from "react";

/**
 * Teclado virtual aberto?
 *
 * Android não expõe isso. O sinal confiável é a `visualViewport`: quando o
 * teclado sobe, a altura visual encolhe em relação à altura da janela. O
 * limiar de 150 px descarta a barra de endereço do navegador, que também
 * encolhe o viewport mas não é teclado.
 *
 * Sem `visualViewport` (WebView antigo) o retorno é sempre `false` — nada
 * quebra, apenas não há ajuste.
 */
export function useTecladoVirtual(): boolean {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const medir = () => setAberto(window.innerHeight - vv.height > 150);
    medir();
    vv.addEventListener("resize", medir);
    return () => vv.removeEventListener("resize", medir);
  }, []);

  return aberto;
}
