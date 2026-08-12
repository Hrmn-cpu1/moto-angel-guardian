# MATRIZ DE COMPATIBILIDADE ANDROID

**Nada nesta tabela foi executado em aparelho ou emulador nesta sessão.** Não
há Android SDK, emulador nem aparelho neste ambiente. O que está marcado como
AUTOMATED foi verificado por `npm test`; todo o resto é análise de código e
documentação, e está marcado como pendente.

Escrever PASS onde nada rodou seria o erro que este projeto já cometeu uma vez
com o mapa preto.

## Alvo declarado

| | |
|---|---|
| minSdk | **23** (Android 6.0) |
| compileSdk / targetSdk | **36** (Android 16) |
| package | `com.motoanjo.app` |
| versionCode / versionName | 4 / 1.3.0-rc1 |

minSdk 23 é decisão de produto, não inércia: o público são motoboys, e
aparelho antigo é a regra. O caminho crítico (abrir, entrar, mapa, GPS, SOS
manual) não usa nenhuma API acima de 23.

## Matriz

| Android / API | Modelo de permissão | Notificação | Foreground service | Background location | WebView | Status | Como validar | Limitações conhecidas |
|---|---|---|---|---|---|---|---|---|
| 6–8 · API 23–27 | runtime permissions; sem "uma vez só" | sem canal obrigatório; sem POST_NOTIFICATIONS | FGS sem tipo | permissão de background não existe separada | WebView do sistema, pode estar muito desatualizada | **NÃO VALIDADO** | EMULATOR | risco maior: WebView antiga pode não suportar CSS/JS moderno do bundle. É a faixa que mais precisa de teste real |
| 9–11 · API 28–30 | API 29 traz background location separada | canais obrigatórios (API 26+) | FGS sem tipo obrigatório | API 29+ exige permissão própria — **não pedimos** | WebView atualizável pela Play | **NÃO VALIDADO** | EMULATOR | — |
| 12–13 · API 31–33 | localização aproximada vs precisa (API 31) | POST_NOTIFICATIONS passa a ser pedida (API 33) | restrições de start em background | idem | — | **NÃO VALIDADO** | EMULATOR + DEVICE | o gate de permissão precisa tratar "aproximada": o código traduz o estado, mas nunca foi visto em tela |
| 14–15 · API 34–35 | permissão pode ser revogada automaticamente por desuso | canal + importância | **FOREGROUND_SERVICE_LOCATION obrigatória** | idem | — | **NÃO VALIDADO** | DEVICE | a permissão está declarada; o serviço ainda não existe |
| 16 · API 36 | alvo de compilação | — | — | — | — | **NÃO COMPILADO** | CI | `targetSdk 36` foi escrito mas nunca compilou aqui. O GitHub Actions é a prova; se um plugin travar, o CI acusa |

## O que já é verificável sem aparelho

| Item | Como | Status |
|---|---|---|
| Regras do SOS, idempotência, validação de fix | `npm test` | **AUTOMATED — 248/248** |
| Motor de detecção de queda (24 cenários sintéticos) | `npm test` | **AUTOMATED** |
| Máquina de permissão de localização (tradução de estados) | `npm test` | **AUTOMATED** |
| Parser de destino e URLs de navegação externa | `npm test` | **AUTOMATED** |
| Contratos do SQL (RLS, tetos, atomicidade) | `npm test` | **AUTOMATED** (texto do SQL, não execução em Postgres) |
| Permissões declaradas no Manifest | `npm test` | **AUTOMATED** |
| Compilação Android, merge do Manifest, APK | GitHub Actions | **CI REQUIRED** |

## Degradação esperada quando algo não estiver disponível

O princípio: **nenhuma indisponibilidade pode impedir o app de abrir nem
derrubar o SOS manual.**

| Falta | O que acontece |
|---|---|
| Permissão de localização negada | app abre; mapa explica e oferece Configurações; SOS manual exige posição e informa isso honestamente |
| Notificação negada (API 33+) | app abre; navegação protegida avisa que não mostra status na barra |
| Sem GPS no aparelho | estado `indisponivel` na tela, sem loop de diálogo |
| WebView antiga | **risco não medido** — é o principal item da faixa API 23–27 |
| Sem internet | APK é casca remota: **o app não abre**. Limitação estrutural, ver `HOSTING-DECOUPLING-PLAN.md` |
| Google Maps não instalado | navegação externa cai no navegador por URL HTTPS |
| Waze não instalado | idem |

## Primeira coisa a fazer quando houver aparelhos

Rodar os testes 01, 02 e 10 do `ANDROID-RC2-TEST-PLAN.md` num aparelho de cada
faixa e preencher a coluna Status. Um aparelho Android 8 e um Android 14 já
cobrem a maior parte do risco real.
