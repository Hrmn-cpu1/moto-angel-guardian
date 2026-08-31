package com.motoanjo.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

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
    public static final String EXTRA_MANOBRA = "manobra";

    /**
     * Motivos publicados para o app.
     *
     * Existem porque "ativo = true" não era verdade: o serviço podia recusar
     * subir (sem permissão) e o JavaScript continuava anunciando proteção em
     * segundo plano. Agora todo caminho que não termina em primeiro plano
     * publica o porquê, e a tela diz exatamente isso.
     */
    public static final String MOTIVO_ATIVO = "ativo";
    public static final String MOTIVO_PARADO = "parado";
    public static final String MOTIVO_SEM_LOCALIZACAO = "sem_permissao_localizacao";
    public static final String MOTIVO_SEM_NOTIFICACAO = "sem_permissao_notificacao";
    public static final String MOTIVO_FALHA_FOREGROUND = "falha_ao_iniciar";

    /** Evita chamar startForeground duas vezes: iniciar é idempotente. */
    private boolean emPrimeiroPlano = false;

    /**
     * Último texto conhecido de cada campo da notificação.
     *
     * BUG REAL (RC4): a Home chamava `atualizar` com alerta e distância e SEM
     * destino. O plugin preenchia destino com "" e a notificação era remontada
     * do zero, então o destino sumia na PRIMEIRA atualização — que acontece
     * logo no início da viagem, quando ainda não há aviso nenhum. Na tela de
     * bloqueio sobrava a palavra "Protegido".
     *
     * Agora o serviço guarda o que já sabe e só troca o campo que chegou no
     * Intent. Campo ausente = mantém; campo presente e vazio = limpa. É o que
     * permite o alerta ir e vir sem levar o destino junto.
     */
    private String destinoAtual = "";
    private String alertaAtual = "";
    private String distanciaAtual = "";
    private String manobraAtual = "";

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

    /* ============================================================== *
     * P0.1b — Movimento (acelerômetro/giroscópio) no serviço
     *
     * POR QUE AQUI E NÃO NA WEBVIEW
     * `devicemotion` só existe enquanto a WebView está viva. Com a tela
     * apagada o Android pode suspendê-la mesmo com o processo de pé — o GPS
     * continuava chegando pelo serviço e a aceleração simplesmente parava.
     * Registrando o SensorEventListener DENTRO do serviço de primeiro plano,
     * a aquisição segue o ciclo de vida da viagem, não o da página.
     *
     * O QUE ESTA CAMADA FAZ: ler, normalizar (m/s² lineares e graus/s) e
     * entregar no máximo 5 amostras por segundo.
     * O QUE ELA NÃO FAZ: decidir se houve queda. A decisão continua sendo do
     * `CrashDetectionEngine` no JS, e o SOS continua sendo o único que já
     * existe. Nada de segundo pipeline de emergência aqui.
     * ============================================================== */

    /** ~5 Hz. Amostrar mais rápido não melhora a detecção e custa bateria. */
    private static final long PERIODO_MOVIMENTO_MS = 200L;

    /** Gravidade padrão, para estimar aceleração linear quando o aparelho não
     *  tem TYPE_LINEAR_ACCELERATION (sensor virtual ausente em modelos baratos). */
    private static final float GRAVIDADE = 9.80665f;

    public interface MovimentoNativo {
        /**
         * @param accelMs2       módulo da aceleração linear, m/s². -1 se ausente.
         * @param gyroDegS       módulo da velocidade angular, graus/s. -1 se ausente.
         * @param monotonicoMs   relógio monotônico (SystemClock.elapsedRealtime).
         * @param quandoMs       relógio de parede, só para log.
         */
        void aoReceber(float accelMs2, float gyroDegS, long monotonicoMs, long quandoMs);
    }

    private static MovimentoNativo ouvinteDeMovimento = null;

    public static void definirOuvinteDeMovimento(MovimentoNativo d) {
        ouvinteDeMovimento = d;
    }

    private SensorManager sensores;
    private Sensor sensorAceleracao;
    private Sensor sensorGiroscopio;
    private SensorEventListener ouvinteSensores;
    private boolean capturandoMovimento = false;
    private boolean aceleracaoLinear = false;

    private static boolean temAceleracaoAgora = false;
    private static boolean temGiroscopioAgora = false;
    private static boolean movimentoAtivoAgora = false;

    public static boolean temAceleracao() {
        return temAceleracaoAgora;
    }

    public static boolean temGiroscopio() {
        return temGiroscopioAgora;
    }

    public static boolean movimentoAtivo() {
        return movimentoAtivoAgora;
    }

    private float ultimoAccel = -1f;
    private float ultimoGyro = -1f;
    private long ultimaEntregaMovimento = 0L;

    /** Um listener por serviço. Idempotente: chamar duas vezes não empilha. */
    private void iniciarSensores() {
        if (capturandoMovimento) return;
        sensores = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensores == null) {
            temAceleracaoAgora = false;
            temGiroscopioAgora = false;
            return;
        }

        sensorAceleracao = sensores.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
        aceleracaoLinear = sensorAceleracao != null;
        if (sensorAceleracao == null) {
            sensorAceleracao = sensores.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        }
        sensorGiroscopio = sensores.getDefaultSensor(Sensor.TYPE_GYROSCOPE);

        temAceleracaoAgora = sensorAceleracao != null;
        temGiroscopioAgora = sensorGiroscopio != null;

        // Sem acelerômetro não há detecção possível. Nada de valor inventado:
        // o app mostra que o aparelho não suporta.
        if (sensorAceleracao == null && sensorGiroscopio == null) {
            movimentoAtivoAgora = false;
            return;
        }

        ouvinteSensores = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent e) {
                if (e == null || e.values == null) return;
                final int tipo = e.sensor == null ? -1 : e.sensor.getType();
                if (tipo == Sensor.TYPE_LINEAR_ACCELERATION || tipo == Sensor.TYPE_ACCELEROMETER) {
                    if (e.values.length < 3) return;
                    final double m = Math.sqrt(
                            e.values[0] * e.values[0]
                                    + e.values[1] * e.values[1]
                                    + e.values[2] * e.values[2]);
                    // Com o acelerômetro cru a gravidade está embutida; tirá-la
                    // do módulo é aproximação, mas é honesta e suficiente para
                    // o motor, que trabalha com picos e não com precisão fina.
                    final double linear = aceleracaoLinear ? m : Math.abs(m - GRAVIDADE);
                    ultimoAccel = (float) linear;
                } else if (tipo == Sensor.TYPE_GYROSCOPE) {
                    if (e.values.length < 3) return;
                    final double r = Math.sqrt(
                            e.values[0] * e.values[0]
                                    + e.values[1] * e.values[1]
                                    + e.values[2] * e.values[2]);
                    ultimoGyro = (float) Math.toDegrees(r);
                } else {
                    return;
                }

                // `elapsedRealtime` não anda para trás nem pula com ajuste de
                // fuso/NTP — é o relógio certo para janela de detecção.
                final long agora = android.os.SystemClock.elapsedRealtime();
                if (agora - ultimaEntregaMovimento < PERIODO_MOVIMENTO_MS) return;
                ultimaEntregaMovimento = agora;

                final MovimentoNativo d = ouvinteDeMovimento;
                if (d == null) return;
                d.aoReceber(ultimoAccel, ultimoGyro, agora, System.currentTimeMillis());
            }

            @Override
            public void onAccuracyChanged(Sensor sensor, int accuracy) {}
        };

        // SENSOR_DELAY_GAME (~50 Hz) na fonte, com throttle nosso na saída: o
        // pico de uma queda dura poucos milissegundos e some em taxa baixa.
        if (sensorAceleracao != null) {
            sensores.registerListener(ouvinteSensores, sensorAceleracao, SensorManager.SENSOR_DELAY_GAME);
        }
        if (sensorGiroscopio != null) {
            sensores.registerListener(ouvinteSensores, sensorGiroscopio, SensorManager.SENSOR_DELAY_GAME);
        }
        capturandoMovimento = true;
        movimentoAtivoAgora = true;
    }

    /** Sem isto o sensor continua ligado depois da viagem, drenando bateria. */
    private void pararSensores() {
        if (sensores != null && ouvinteSensores != null) {
            try {
                sensores.unregisterListener(ouvinteSensores);
            } catch (Exception ignored) {
                // O listener morre com o serviço de qualquer forma.
            }
        }
        ouvinteSensores = null;
        sensorAceleracao = null;
        sensorGiroscopio = null;
        sensores = null;
        capturandoMovimento = false;
        movimentoAtivoAgora = false;
        ultimoAccel = -1f;
        ultimoGyro = -1f;
        ultimaEntregaMovimento = 0L;
    }


    /**
     * Estado REAL do serviço, para o app parar de prometer o que o Android
     * recusou. `ativo` é o serviço em primeiro plano; `notificacaoVisivel` é
     * outra pergunta — no Android 13+ a notificação pode estar bloqueada com o
     * serviço rodando, e é exatamente esse caso que a tela precisa mostrar.
     */
    public interface EstadoDoServico {
        void aoMudar(boolean ativo, boolean notificacaoVisivel, String motivo);
    }

    private static EstadoDoServico ouvinteDeEstado = null;
    private static boolean ativoAgora = false;
    private static boolean notificacaoVisivelAgora = false;
    private static String motivoAgora = MOTIVO_PARADO;

    public static void definirOuvinteDeEstado(EstadoDoServico d) {
        ouvinteDeEstado = d;
    }

    public static boolean estaAtivo() {
        return ativoAgora;
    }

    public static boolean notificacaoVisivel() {
        return notificacaoVisivelAgora;
    }

    public static String motivoAtual() {
        return motivoAgora;
    }

    private static void publicarEstado(boolean ativo, boolean visivel, String motivo) {
        ativoAgora = ativo;
        notificacaoVisivelAgora = visivel;
        motivoAgora = motivo;
        final EstadoDoServico d = ouvinteDeEstado;
        if (d != null) d.aoMudar(ativo, visivel, motivo);
    }

    /** A notificação vai mesmo aparecer? Vale em qualquer API, inclusive < 33. */
    private boolean podeMostrarNotificacao() {
        try {
            return NotificationManagerCompat.from(this).areNotificationsEnabled();
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        final String acao = intent == null ? null : intent.getAction();
        LockDiagnostics.registrar(this, "SERVICE_STARTED");

        if (ACAO_PARAR.equals(acao)) {
            pararTudo();
            return START_NOT_STICKY;
        }

        // Só troca o campo que veio no Intent. Ausente mantém o valor anterior;
        // presente e vazio limpa. É isto que impede a atualização de alerta de
        // apagar o destino da tela de bloqueio.
        absorver(intent);

        // API 34+ derruba o app com SecurityException se um serviço do tipo
        // `location` subir sem a permissão concedida. Falhar limpo é melhor
        // que crashar em cima de alguém que está pilotando.
        if (!temPermissaoDeLocalizacao()) {
            pararTudo();
            publicarEstado(false, podeMostrarNotificacao(), MOTIVO_SEM_LOCALIZACAO);
            return START_NOT_STICKY;
        }

        criarCanal();
        final Notification notificacao = montarNotificacao();
        final boolean visivel = podeMostrarNotificacao();

        if (!emPrimeiroPlano) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    // API 34+ exige declarar o tipo na chamada, não só no Manifest.
                    startForeground(NOTIFICACAO_ID, notificacao, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                } else {
                    startForeground(NOTIFICACAO_ID, notificacao);
                }
                emPrimeiroPlano = true;
                iniciarCaptura();
                registrarReceptorDeTela();
            } catch (Exception e) {
                // API 31+ recusa subir FGS a partir do segundo plano
                // (ForegroundServiceStartNotAllowedException) e a 34+ recusa o
                // tipo `location` em algumas combinações. Antes isso subia como
                // exception nativa; agora vira estado, e a viagem continua em
                // primeiro plano.
                pararTudo();
                publicarEstado(false, visivel, MOTIVO_FALHA_FOREGROUND);
                return START_NOT_STICKY;
            }
        } else {
            final NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICACAO_ID, notificacao);
        }

        // O serviço está de pé. Se a notificação não pode aparecer, ele continua
        // valendo (mantém o processo e o GPS), mas NÃO é honesto dizer que o
        // usuário está vendo o status: o motivo carrega essa diferença.
        publicarEstado(true, visivel, visivel ? MOTIVO_ATIVO : MOTIVO_SEM_NOTIFICACAO);

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
     * Copia do Intent apenas os campos que ele realmente traz.
     *
     * `hasExtra` é a diferença entre "não falei sobre o destino" e "apague o
     * destino". Sem essa distinção qualquer atualização parcial zeraria o
     * resto da notificação.
     */
    private void absorver(Intent intent) {
        if (intent == null) return;
        if (intent.hasExtra(EXTRA_DESTINO)) destinoAtual = texto(intent.getStringExtra(EXTRA_DESTINO));
        if (intent.hasExtra(EXTRA_ALERTA)) alertaAtual = texto(intent.getStringExtra(EXTRA_ALERTA));
        if (intent.hasExtra(EXTRA_DISTANCIA)) distanciaAtual = texto(intent.getStringExtra(EXTRA_DISTANCIA));
        if (intent.hasExtra(EXTRA_MANOBRA)) manobraAtual = texto(intent.getStringExtra(EXTRA_MANOBRA));
    }

    private static String texto(String v) {
        return v == null ? "" : v.trim();
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
                if (l == null) return;
                // Com a tela apagada a WebView congela e para de publicar
                // quadros. O marcador do bloqueio anda com ESTE GPS, que já
                // existe — nenhum segundo LocationManager é criado.
                LockNavigationState.atualizarPosicao(l.getLatitude(), l.getLongitude());
                final PosicaoNativa d = ouvinteExterno;
                if (d == null) return;
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
            // Movimento só depois que a posição subiu: mesma viagem, mesmo
            // ciclo de vida, um único ponto de parada.
            iniciarSensores();
        } catch (SecurityException e) {
            // Permissão revogada entre a checagem e o pedido: sem captura, mas
            // sem derrubar o app.
            capturando = false;
        }
    }

    /** Sem isto sobra GPS ligado depois da viagem — o pior tipo de vazamento. */
    private void pararCaptura() {
        pararSensores();
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

    /* ============================================================== *
     * P0.1c — Navegação sobre a tela de bloqueio (hotfix físico)
     *
     * O QUE ESTAVA ERRADO
     * A Activity só era pedida em ACTION_SCREEN_OFF. Em aparelho real (One UI)
     * isso falha por dois motivos somados:
     *   1) quando o SCREEN_OFF chega, o app já perdeu a janela visível, então
     *      o Android 10+ recusa o início de Activity em segundo plano — e o
     *      catch silencioso escondia a recusa;
     *   2) mesmo quando a Activity é criada com a tela apagada, ela é parada
     *      logo em seguida; ao ACORDAR a tela quem sobe na frente é o keyguard
     *      do sistema, e ninguém pedia a Activity de volta.
     *
     * O QUE FAZEMOS AGORA
     *   . pedimos a Activity no SCREEN_OFF (pré-aquecimento, quando ainda há
     *     janela visível) E no SCREEN_ON com o keyguard ainda travado — este
     *     segundo é o momento em que o usuário realmente olha a tela;
     *   . no Android 14+ declaramos explicitamente a intenção de iniciar
     *     Activity em segundo plano via ActivityOptions do PendingIntent, que
     *     é a via oficial para serviço de primeiro plano;
     *   . registramos o receptor com RECEIVER_NOT_EXPORTED (API 33+), senão a
     *     34 recusa o registro e o recurso morre calado;
     *   . logamos cada etapa em MOTOANJO_LOCK para o teste físico ser auditável.
     *
     * Continua NÃO havendo: desbloqueio automático, turnScreenOn, overlay,
     * full-screen intent, segundo GPS, segundo mapa e segundo SOS.
     * ============================================================== */

    public static final String LOG_LOCK = "MOTOANJO_LOCK";

    private BroadcastReceiver receptorDeTela = null;
    private final Handler agendaLock = new Handler(Looper.getMainLooper());

    /**
     * Rajada de tentativas ao acordar a tela (P0.1c — Fase A).
     *
     * O sistema pode recusar a primeira solicitação enquanto o keyguard ainda
     * está compondo. Insistir por poucos segundos custa nada e é a diferença
     * entre a navegação aparecer imediatamente ou só quando o Android resolver.
     */
    private static final long[] RETENTATIVAS_MS = {0L, 400L, 1200L, 3000L};

    private void tentarAbrirEmRajada(final String origem) {
        agendaLock.removeCallbacksAndMessages(null);
        for (final long atraso : RETENTATIVAS_MS) {
            agendaLock.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (LockNavigationState.activityViva()) return;
                    if (!aparelhoBloqueado()) return;
                    abrirNavegacaoBloqueada(origem + "+" + atraso + "ms");
                }
            }, atraso);
        }
    }

    private void registrarReceptorDeTela() {
        if (receptorDeTela != null) return;
        receptorDeTela = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                final String a = intent == null ? null : intent.getAction();
                if (Intent.ACTION_SCREEN_OFF.equals(a)) {
                    LockDiagnostics.registrar(ViagemSeguraService.this, "SCREEN_OFF_RECEIVED");
                    // Pré-aquecimento: aqui ainda existe janela visível, então
                    // o start de Activity não é considerado "de segundo plano".
                    abrirNavegacaoBloqueada("screen_off");
                } else if (Intent.ACTION_SCREEN_ON.equals(a)) {
                    LockDiagnostics.registrar(ViagemSeguraService.this, "SCREEN_ON_RECEIVED");
                    if (aparelhoBloqueado()) {
                        abrirNavegacaoBloqueada("screen_on");
                        tentarAbrirEmRajada("screen_on_retry");
                    } else {
                        android.util.Log.i(LOG_LOCK, "SCREEN_ON sem keyguard: nada a mostrar");
                    }
                } else if (Intent.ACTION_USER_PRESENT.equals(a)) {
                    agendaLock.removeCallbacksAndMessages(null);
                    android.util.Log.i(LOG_LOCK, "USER_PRESENT: fechando navegacao bloqueada");
                    // Desbloqueou: quem manda é o cockpit dentro do app.
                    LockNavigationState.fechar();
                }
            }
        };
        final IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_USER_PRESENT);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(receptorDeTela, f, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(receptorDeTela, f);
            }
            LockDiagnostics.registrar(this, "SCREEN_RECEIVER_REGISTERED");
        } catch (Exception e) {
            android.util.Log.w(LOG_LOCK, "falha ao registrar receptor de tela: " + e);
            receptorDeTela = null;
        }
    }

    private void removerReceptorDeTela() {
        if (receptorDeTela == null) return;
        try {
            unregisterReceiver(receptorDeTela);
        } catch (Exception ignored) {
            // Já removido: nada a fazer.
        }
        receptorDeTela = null;
    }

    /** Keyguard travado é a única situação em que a Activity faz sentido. */
    private boolean aparelhoBloqueado() {
        try {
            final android.app.KeyguardManager k =
                    (android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            return k != null && k.isKeyguardLocked();
        } catch (Exception e) {
            return false;
        }
    }

    /** Só abre com viagem ativa E com a preferência do usuário ligada. */
    private void abrirNavegacaoBloqueada(String origem) {
        final LockNavigationState.Quadro q = LockNavigationState.atual();
        LockDiagnostics.registrar(this, "TRIP_ACTIVE=" + q.ativa);
        if (!q.ativa || !q.permitida) {
            android.util.Log.i(
                    LOG_LOCK,
                    "LockNavigationActivity NAO solicitada ("
                            + origem
                            + "): ativa="
                            + q.ativa
                            + " permitida="
                            + q.permitida);
            return;
        }
        final Intent i = new Intent(this, LockNavigationActivity.class);
        i.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        LockDiagnostics.registrar(this, "LOCK_NAV_INTENT_CREATED", "origin=" + origem);
        LockDiagnostics.registrar(this, "START_ACTIVITY_ATTEMPT", "origin=" + origem);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Via oficial na 34+: o serviço de primeiro plano declara que
                // o PendingIntent pode iniciar Activity vinda do segundo plano.
                final android.app.ActivityOptions opcoes = android.app.ActivityOptions.makeBasic();
                opcoes.setPendingIntentBackgroundActivityStartMode(
                        android.app.ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED);
                final PendingIntent pi =
                        PendingIntent.getActivity(
                                this,
                                0,
                                i,
                                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                pi.send(this, 0, null, null, null, null, opcoes.toBundle());
            } else {
                startActivity(i);
            }
            // SUCCESS significa apenas que a API aceitou a solicitação. A prova
            // de criação real é LOCK_ACTIVITY_ON_CREATE, emitido pela Activity.
            LockDiagnostics.registrar(this, "START_ACTIVITY_SUCCESS", "origin=" + origem);
        } catch (Exception e) {
            LockDiagnostics.registrar(
                    this,
                    "START_ACTIVITY_EXCEPTION",
                    "origin=" + origem + " type=" + e.getClass().getSimpleName());
            // Sem navegação no bloqueio: a notificação persistente continua
            // sendo o caminho oficial, e a viagem não é afetada.
        }
    }


    private boolean temPermissaoDeLocalizacao() {
        return ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED
                || ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;
    }

    private void pararTudo() {
        pararCaptura();
        removerReceptorDeTela();
        // Viagem encerrada fecha a navegação de bloqueio; nada de tela
        // prometendo proteção depois do fim.
        LockNavigationState.limpar();
        if (emPrimeiroPlano) {
            stopForeground(true);
            emPrimeiroPlano = false;
        }
        final NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIFICACAO_ID);
        // Viagem encerrada não deixa destino velho para a próxima.
        destinoAtual = "";
        alertaAtual = "";
        distanciaAtual = "";
        manobraAtual = "";
        publicarEstado(false, notificacaoVisivelAgora, MOTIVO_PARADO);
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

    private Notification montarNotificacao() {
        final Intent abrir = new Intent(this, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        final PendingIntent voltar = PendingIntent.getActivity(this, 0, abrir, flags);

        /*
         * Uma linha só cabe na tela de bloqueio recolhida, então ela mostra o
         * mais urgente que EXISTE — nada é inventado para preencher:
         *   1. alerta de risco (com distância, quando veio junto);
         *   2. próxima manobra;
         *   3. destino.
         * O texto expandido mostra o resto, sem repetir a linha principal.
         */
        final StringBuilder linha = new StringBuilder("Protegido");
        if (!alertaAtual.isEmpty()) {
            linha.append(" · ").append(alertaAtual);
            if (!distanciaAtual.isEmpty()) linha.append(" a ").append(distanciaAtual);
        } else if (!manobraAtual.isEmpty()) {
            linha.append(" · ").append(manobraAtual);
        } else if (!destinoAtual.isEmpty()) {
            linha.append(" · ").append(destinoAtual);
        }

        final StringBuilder expandido = new StringBuilder(linha);
        if (!alertaAtual.isEmpty() && !manobraAtual.isEmpty()) {
            expandido.append("\nPróxima: ").append(manobraAtual);
        }
        if (!destinoAtual.isEmpty() && linha.indexOf(destinoAtual) < 0) {
            expandido.append("\nDestino: ").append(destinoAtual);
        }

        final NotificationCompat.Builder b = new NotificationCompat.Builder(this, CANAL_ID)
                .setContentTitle("Moto Anjo — Viagem Segura")
                .setContentText(linha.toString())
                // Ícone monocromático do próprio app: o de sistema virava um
                // pino genérico na barra, e o arquivo já existia sem uso.
                .setSmallIcon(R.drawable.ic_stat_moto_anjo)
                .setContentIntent(voltar)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
                // VISIBILITY_PUBLIC: é isto que faz o conteúdo aparecer na tela
                // de bloqueio, pelo caminho oficial do Android.
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        if (expandido.length() > linha.length()) {
            b.setStyle(new NotificationCompat.BigTextStyle().bigText(expandido.toString()));
        }

        return b.build();
    }
}
