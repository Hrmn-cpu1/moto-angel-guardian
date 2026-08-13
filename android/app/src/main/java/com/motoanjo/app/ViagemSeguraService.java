package com.motoanjo.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

/**
 * Serviço de primeiro plano da Viagem Segura.
 *
 * POR QUE ELE EXISTE
 * Enquanto a viagem está ativa, o motociclista guarda o telefone no bolso ou
 * apaga a tela. Sem um serviço de primeiro plano, o Android suspende a WebView
 * e o rastreamento simplesmente para — sem aviso. A notificação persistente é
 * o preço que o sistema cobra por continuar rodando, e é justo: a pessoa
 * precisa saber que está sendo acompanhada.
 *
 * O QUE ELE FAZ E O QUE NÃO FAZ
 *   FAZ: mantém o processo vivo durante a viagem, com tipo `location`, e
 *        mostra uma notificação que aparece na tela de bloqueio pelo caminho
 *        normal do Android.
 *   NÃO FAZ: não desenha nada por cima da tela de bloqueio, não desbloqueia o
 *        aparelho, não pede SYSTEM_ALERT_WINDOW e não pede
 *        ACCESS_BACKGROUND_LOCATION. Overlay sobre a lock screen é gambiarra
 *        que a Play reprova e que quebra a cada versão do Android.
 *
 * LOCALIZAÇÃO NATIVA
 * Manter o processo vivo NÃO garante que `navigator.geolocation` continue
 * entregando posição com a tela apagada: o Android congela temporizadores e
 * pode suspender a WebView mesmo com o processo de pé. Por isso a captura
 * agora é nativa, dentro do ciclo de vida deste serviço — começa com a
 * viagem, para com a viagem.
 *
 * Usa `LocationManager` do framework, não o FusedLocationProvider. O Fused é
 * melhor em economia, mas exige `play-services-location` no Gradle, e
 * acrescentar dependência a um build que acabou de ficar verde é risco sem
 * retorno neste fechamento. A troca é local a esta classe quando fizer sentido.
 */
public class ViagemSeguraService extends Service {

    public static final String CANAL_ID = "moto_anjo_viagem";
    public static final int NOTIFICACAO_ID = 4201;

    public static final String ACAO_INICIAR = "com.motoanjo.app.VIAGEM_INICIAR";
    public static final String ACAO_ATUALIZAR = "com.motoanjo.app.VIAGEM_ATUALIZAR";
    public static final String ACAO_PARAR = "com.motoanjo.app.VIAGEM_PARAR";

    public static final String EXTRA_DESTINO = "destino";
    public static final String EXTRA_ALERTA = "alerta";
    public static final String EXTRA_DISTANCIA = "distancia";

    /** Evita chamar startForeground duas vezes: iniciar é idempotente. */
    private boolean emPrimeiroPlano = false;

    /** Intervalo mínimo entre posições. Conservador de propósito: o produto
     *  precisa de trajeto, não de amostragem contínua — GPS a 1 Hz durante um
     *  turno inteiro come a bateria que o motoboy vai precisar no fim do dia. */
    private static final long INTERVALO_MS = 5000L;
    private static final float DISTANCIA_M = 10f;

    private LocationManager gerenciador;
    private LocationListener ouvinteDePosicao;
    private boolean capturando = false;

    /**
     * Ponte para o app. Estático porque o plugin e o serviço são instâncias
     * separadas; é só um encaminhamento de evento — o estado da viagem
     * continua tendo fonte única no React (`src/lib/trip.ts`).
     */
    public interface PosicaoNativa {
        void aoReceber(double lat, double lng, float precisaoM, float velocidadeMs, long quandoMs);
    }

    private static PosicaoNativa ouvinteExterno = null;

    public static void definirOuvinte(PosicaoNativa d) {
        ouvinteExterno = d;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        final String acao = intent == null ? null : intent.getAction();

        if (ACAO_PARAR.equals(acao)) {
            pararTudo();
            return START_NOT_STICKY;
        }

        final String destinoTexto = intent == null ? null : intent.getStringExtra(EXTRA_DESTINO);
        final String alerta = intent == null ? null : intent.getStringExtra(EXTRA_ALERTA);
        final String distancia = intent == null ? null : intent.getStringExtra(EXTRA_DISTANCIA);

        // API 34+ derruba o app com SecurityException se um serviço do tipo
        // `location` subir sem a permissão concedida. Falhar limpo é melhor
        // que crashar em cima de alguém que está pilotando.
        if (!temPermissaoDeLocalizacao()) {
            pararTudo();
            return START_NOT_STICKY;
        }

        criarCanal();
        final Notification notificacao = montarNotificacao(destinoTexto, alerta, distancia);

        if (!emPrimeiroPlano) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // API 34+ exige declarar o tipo na chamada, não só no Manifest.
                startForeground(NOTIFICACAO_ID, notificacao, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICACAO_ID, notificacao);
            }
            emPrimeiroPlano = true;
            iniciarCaptura();
        } else {
            final NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICACAO_ID, notificacao);
        }

        // START_NOT_STICKY de propósito: se o Android matar o processo, NÃO
        // queremos que ele ressuscite o serviço sozinho com um Intent vazio.
        // Isso criaria "viagem fantasma" — rastreamento rodando sem que o
        // usuário tenha viagem nenhuma na tela. Quem decide reviver é o app,
        // ao reabrir, olhando o estado real da viagem.
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        pararTudo();
        super.onDestroy();
    }

    /**
     * O usuário removeu o app dos recentes. Sem viagem visível na tela, manter
     * um serviço de localização vivo seria abusivo — e a notificação órfã faria
     * a pessoa achar que está protegida quando não está.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        pararTudo();
        super.onTaskRemoved(rootIntent);
    }

    /**
     * Só começa a capturar com o serviço em primeiro plano — nunca no boot,
     * nunca fora de viagem. Idempotente.
     */
    private void iniciarCaptura() {
        if (capturando || !temPermissaoDeLocalizacao()) return;
        gerenciador = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (gerenciador == null) return;

        ouvinteDePosicao = new LocationListener() {
            @Override
            public void onLocationChanged(Location l) {
                final PosicaoNativa d = ouvinteExterno;
                if (d == null || l == null) return;
                d.aoReceber(
                        l.getLatitude(),
                        l.getLongitude(),
                        l.hasAccuracy() ? l.getAccuracy() : -1f,
                        l.hasSpeed() ? l.getSpeed() : -1f,
                        l.getTime());
            }

            // Obrigatórios abaixo da API 30; sem eles alguns aparelhos antigos
            // lançam AbstractMethodError.
            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {}

            @Override
            public void onProviderEnabled(String provider) {}

            @Override
            public void onProviderDisabled(String provider) {}
        };

        try {
            if (gerenciador.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                gerenciador.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER, INTERVALO_MS, DISTANCIA_M, ouvinteDePosicao);
            }
            // Rede como complemento: em túnel, garagem ou prédio, o GPS some e
            // uma posição aproximada ainda vale mais que nenhuma.
            if (gerenciador.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                gerenciador.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER, INTERVALO_MS, DISTANCIA_M, ouvinteDePosicao);
            }
            capturando = true;
        } catch (SecurityException e) {
            // Permissão revogada entre a checagem e o pedido: sem captura, mas
            // sem derrubar o app.
            capturando = false;
        }
    }

    /** Sem isto sobra GPS ligado depois da viagem — o pior tipo de vazamento. */
    private void pararCaptura() {
        if (gerenciador != null && ouvinteDePosicao != null) {
            try {
                gerenciador.removeUpdates(ouvinteDePosicao);
            } catch (SecurityException ignored) {
                // Nada a fazer: o listener morre com o serviço.
            }
        }
        ouvinteDePosicao = null;
        gerenciador = null;
        capturando = false;
    }

    private boolean temPermissaoDeLocalizacao() {
        return ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED
                || ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;
    }

    private void pararTudo() {
        pararCaptura();
        if (emPrimeiroPlano) {
            stopForeground(true);
            emPrimeiroPlano = false;
        }
        final NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIFICACAO_ID);
        stopSelf();
    }

    private void criarCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        final NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CANAL_ID) != null) return;

        final NotificationChannel canal = new NotificationChannel(
                CANAL_ID,
                "Viagem Segura",
                // IMPORTANCE_LOW: aparece na barra e na tela de bloqueio, mas
                // não toca som nem vibra. Um alarme a cada atualização de
                // trajeto seria insuportável em duas horas de turno.
                NotificationManager.IMPORTANCE_LOW);
        canal.setDescription("Mostra que a Viagem Segura está ativa e o próximo alerta do trajeto.");
        canal.setShowBadge(false);
        canal.enableVibration(false);
        canal.setSound(null, null);
        canal.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(canal);
    }

    private Notification montarNotificacao(String destinoTexto, String alerta, String distancia) {
        final Intent abrir = new Intent(this, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        final PendingIntent voltar = PendingIntent.getActivity(this, 0, abrir, flags);

        final StringBuilder linha = new StringBuilder("Protegido");
        if (alerta != null && !alerta.isEmpty()) {
            linha.append(" · ").append(alerta);
            if (distancia != null && !distancia.isEmpty()) {
                linha.append(" a ").append(distancia);
            }
        } else if (destinoTexto != null && !destinoTexto.isEmpty()) {
            linha.append(" · ").append(destinoTexto);
        }

        final NotificationCompat.Builder b = new NotificationCompat.Builder(this, CANAL_ID)
                .setContentTitle("Moto Anjo — Viagem Segura")
                .setContentText(linha.toString())
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(voltar)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
                // VISIBILITY_PUBLIC: é isto que faz o conteúdo aparecer na tela
                // de bloqueio, pelo caminho oficial do Android.
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        if (destinoTexto != null && !destinoTexto.isEmpty()) {
            b.setStyle(new NotificationCompat.BigTextStyle()
                    .bigText(linha + "\nDestino: " + destinoTexto));
        }

        return b.build();
    }
}
