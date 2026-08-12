# PLANO DE PORTE PARA iOS

**Nada de iOS foi criado nesta sessão**, como pedido: sem `cap add ios`, sem
Podfile, sem projeto Xcode, sem assinatura. Isto é o levantamento.

## O que já está pronto para atravessar

A separação feita neste checkpoint não foi estética. Estes módulos são
**plataforma-independentes** e vão para o iOS sem reescrita:

| Módulo | O que faz |
|---|---|
| `src/lib/crash-detection.ts` | motor de detecção de queda: recebe amostras normalizadas, devolve estado. Não sabe o que é Android |
| `src/lib/location-permission.ts` | tradução de estados de permissão (a parte pura) |
| `src/lib/external-navigation.ts` | parser de destino e construção de URLs |
| `src/lib/map-layers.ts` | preferências de camadas |
| `src/lib/sos-client.ts` | validação de fix e regras do SOS |
| SQL / RPCs | não muda nada |

A parte que precisa de adaptador por plataforma é a **captura**, não a lógica.

## Interfaces a implementar no iOS

| Interface | Android hoje | iOS |
|---|---|---|
| LocationProvider | `@capacitor/geolocation` | Core Location |
| BackgroundTrackingProvider | Foreground Service (a implementar) | `allowsBackgroundLocationUpdates` + modo `location` |
| SensorProvider | acelerômetro/giroscópio via plugin | Core Motion (`CMMotionManager`) |
| ExternalNavigationProvider | `window.open` + `@capacitor/browser` | `UIApplication.open` com `comgooglemaps://`, `waze://` e fallback HTTPS |
| Lifecycle/LockScreen | Activity + FGS | cenas, Live Activity (opcional) |

## Diferenças que vão doer

1. **Background é mais restrito.** iOS não tem foreground service. O
   equivalente é background location com o modo declarado, e o sistema pode
   suspender o app. Rastreamento contínuo com a tela apagada é mais frágil que
   no Android — não prometa o mesmo comportamento.
2. **Permissão em dois passos.** "Ao usar o app" e "Sempre" são diálogos
   separados, e "Sempre" só pode ser pedida depois. O gate atual precisa de um
   estado a mais.
3. **Strings obrigatórias no Info.plist.** `NSLocationWhenInUseUsageDescription`,
   `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSMotionUsageDescription`.
   Texto ruim aqui é motivo de rejeição.
4. **Privacy manifest e nutrition labels.** A App Store exige declarar
   localização precisa, dados de contato e finalidade. A política de retenção
   documentada em `RC2-MIGRATIONS-FINAL.md` já é insumo disso.
5. **`window.open` com `_blank`** não se comporta como no Android. A ponte de
   navegação externa precisa de um adaptador iOS de verdade.
6. **Sem `intent-filter`.** Receber destino de outro app usa Universal Links e
   Share Extension — desenho diferente do Android.

## Ordem sugerida

1. Android aprovado em aparelho (pré-requisito);
2. `cap add ios` e subir a interface;
3. LocationProvider + gate de permissão em dois passos;
4. navegação externa;
5. background location;
6. Core Motion alimentando o **mesmo** `CrashDetectionEngine`;
7. privacy manifest e submissão.

Não comece o iOS antes de o Android estar validado em aparelho. Portar um
problema não resolvido só o duplica.
