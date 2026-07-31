# Ícones Android — Moto Anjo

Gerados a partir de `src/assets/moto-anjo-emblem.png` (1024px).

- `app/src/main/res/mipmap-*/ic_launcher.png` — launcher legado (48→192px)
- `app/src/main/res/mipmap-*/ic_launcher_round.png` — ícone redondo
- `app/src/main/res/mipmap-*/ic_launcher_foreground.png` + `ic_launcher_background.png` — camadas adaptativas (108dp)
- `app/src/main/res/mipmap-anydpi-v26/ic_launcher(.round).xml` — adaptive icon + monochrome (Android 13+)
- `app/src/main/res/drawable-*/ic_stat_moto_anjo.png` — ícone de notificação (silhueta branca, exigido pelo Android 5+)
- `app/src/main/ic_launcher-playstore.png` — 512px para a Play Store
- `resources/icon*.png` — fontes para `npx @capacitor/assets generate --android`

No `AndroidManifest.xml`, para notificações:

```xml
<meta-data android:name="com.google.firebase.messaging.default_notification_icon"
           android:resource="@drawable/ic_stat_moto_anjo" />
<meta-data android:name="com.google.firebase.messaging.default_notification_color"
           android:resource="@color/colorAccent" />
```
