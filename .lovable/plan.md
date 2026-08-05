# Plano — Exportar código-fonte do Moto Anjo em PDF

## Visão geral
Gerar um PDF com **todo o código-fonte textual** do projeto Moto Anjo organizado de forma hierárquica, fácil de ler e com índice de arquivos.

## O que será incluído
- Todos os arquivos de código-fonte do projeto: `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.sql`, `.json`, `.md`, `.html`, `.xml`, `.gradle`.
- Estrutura completa de pastas (`src/`, `supabase/`, `android/` fonte, `public/` configuração, etc.).

## O que será listado, mas não renderizado integralmente
- Arquivos binários (imagens PNG/JPG/WebP, ícones, fontes, lockfiles binários, APKs).
- `node_modules/`, `.git/`, `dist/` e caches de build.

## Como será gerado
1. Varredura do repositório ignorando diretórios de dependência/build e arquivos binários.
2. Ordenação dos arquivos por caminho lógico (configuração → supabase → src → android).
3. Geração do PDF em US Letter com:
   - Capa institucional (Moto Anjo — Código-Fonte Completo).
   - Índice de arquivos.
   - Cada arquivo em seção com caminho destacado e conteúdo em fonte monoespaçada.
   - Numeração de páginas.
4. Validação visual página a página para evitar cortes ou sobreposições.
5. Salvamento em `/mnt/documents/` com tag `<presentation-artifact>` para download.

## Formato do PDF
- Papel: US Letter (8,5" × 11").
- Fonte principal: DejaVu Sans (suporte a acentos).
- Fonte de código: DejaVu Sans Mono.
- Margens: 1 polegada.
- Tamanho do corpo do código: 8–9 pt para caber linhas de até ~90 caracteres sem quebra excessiva.

## Entrega final
- Arquivo salvo em `/mnt/documents/moto-anjo-codigo-fonte.pdf`.
- Link de download apresentado via `<presentation-artifact>`.
