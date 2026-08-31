package com.motoanjo.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Navegação sobre a tela de bloqueio (P0.1c).
 *
 * O QUE ELA FAZ
 * Mostra, quando o aparelho está bloqueado e a tela acesa, o quadro atual da
 * viagem que JÁ existe: próxima manobra, distância, traçado, posição, restante
 * e ETA, o resumo de risco do Copiloto e o SOS.
 *
 * O QUE ELA NÃO FAZ, DE PROPÓSITO
 *   . não pede desbloqueio automático do aparelho (nada de
 *     requestDismissKeyguard sem ação do usuário);
 *   . não usa full-screen intent — isso é para chamada e alarme, não para
 *     navegação contínua;
 *   . não mantém a tela ligada por padrão (sem FLAG_KEEP_SCREEN_ON): tela
 *     apagada continua com GPS, sensores e serviço de primeiro plano;
 *   . não cria segunda viagem, segunda rota, segundo GPS nem segundo SOS. Ela
 *     desenha o que o app publicou e delega o SOS ao pipeline existente;
 *   . não mostra nome, e-mail, telefone ou contatos.
 *
 * CICLO DE VIDA
 * Ela é iniciada pelo serviço quando a tela apaga durante uma viagem ativa
 * (momento em que o app ainda está visível, então não há início de Activity em
 * segundo plano). Some quando: a viagem termina, o usuário desbloqueia o
 * aparelho ou o estado publicado deixa de estar ativo. Recriação por process
 * death não inventa viagem: sem quadro ativo, ela se fecha.
 */
public class LockNavigationActivity extends Activity {

    /** Tempo de pressão para acionar o SOS. Igual em intenção ao botão do app:
     *  toque acidental no bolso não pode chamar socorro. */
    private static final long SEGURAR_SOS_MS = 1500L;

    private final Handler principal = new Handler(Looper.getMainLooper());

    private TextView manobra;
    private TextView distancia;
    private TextView destino;
    private TextView telemetria;
    private TextView risco;
    private TextView sos;
    private MapaTilesView mapa;

    private LockNavigationState.Ouvinte ouvinte;
    private Runnable fechamento;
    private long pressionadoEm = 0L;
    private boolean sosPedido = false;
    private boolean primeiroDesenho = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LockDiagnostics.registrar(this, "LOCK_ACTIVITY_ON_CREATE");
        LockNavigationState.marcarActivity(true);

        // API oficial. Abaixo da 27 só existe a flag de janela equivalente.
        // Chamada ANTES de qualquer conteúdo: a decisão de aparecer sobre o
        // keyguard precisa estar tomada antes de a janela ser apresentada.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        }

        setContentView(montarTela());

        final LockNavigationState.Quadro inicial = LockNavigationState.atual();
        if (!inicial.ativa || !inicial.permitida) {
            // Estado persistido manda. Activity recriada não vira viagem.
            android.util.Log.i(
                    ViagemSeguraService.LOG_LOCK,
                    "LockNavigationActivity encerrada no onCreate: sem quadro ativo");
            finish();
            return;
        }
        aplicar(inicial);

        ouvinte = q -> principal.post(() -> {
            if (isFinishing()) return;
            if (!q.ativa || !q.permitida) {
                finish();
                return;
            }
            aplicar(q);
        });
        LockNavigationState.definirOuvinte(ouvinte);

        fechamento = () -> principal.post(this::finish);
        LockNavigationState.definirFechamento(fechamento);
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        android.util.Log.i(ViagemSeguraService.LOG_LOCK, "LockNavigationActivity onNewIntent");
    }

    @Override
    protected void onResume() {
        super.onResume();
        LockDiagnostics.registrar(this, "LOCK_ACTIVITY_ON_RESUME");
        final LockNavigationState.Quadro q = LockNavigationState.atual();
        if (!q.ativa || !q.permitida) {
            // Viagem terminou enquanto a tela estava apagada: não sobra tela
            // prometendo navegação.
            finish();
            return;
        }
        aplicar(q);
    }

    @Override
    protected void onStart() {
        super.onStart();
        LockDiagnostics.registrar(this, "LOCK_ACTIVITY_ON_START");
    }

    @Override
    protected void onPause() {
        LockDiagnostics.registrar(this, "LOCK_ACTIVITY_ON_PAUSE");
        super.onPause();
    }

    @Override
    protected void onStop() {
        LockDiagnostics.registrar(this, "LOCK_ACTIVITY_ON_STOP");
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        LockDiagnostics.registrar(this, "LOCK_ACTIVITY_ON_DESTROY");
        LockNavigationState.marcarActivity(false);
        if (mapa != null) mapa.encerrar();
        LockNavigationState.removerOuvinte(ouvinte);
        LockNavigationState.removerFechamento(fechamento);
        principal.removeCallbacksAndMessages(null);
        super.onDestroy();
    }


    private void aplicar(LockNavigationState.Quadro q) {
        if (!primeiroDesenho) {
            primeiroDesenho = true;
            // Prova de que a tela já mostra navegação real, não moldura vazia.
            LockDiagnostics.registrar(this, "FIRST_STATE_RENDER");
        }
        manobra.setText(q.manobra.isEmpty() ? "Siga em frente" : q.manobra);
        distancia.setText(q.distanciaManobra);
        distancia.setVisibility(q.distanciaManobra.isEmpty() ? View.GONE : View.VISIBLE);
        destino.setText(q.destino);
        destino.setVisibility(q.destino.isEmpty() ? View.GONE : View.VISIBLE);

        final StringBuilder t = new StringBuilder();
        if (!q.restante.isEmpty()) t.append(q.restante);
        if (!q.eta.isEmpty()) {
            if (t.length() > 0) t.append("   ·   ");
            t.append(q.eta);
        }
        telemetria.setText(t.toString());
        telemetria.setVisibility(t.length() == 0 ? View.GONE : View.VISIBLE);

        risco.setText(q.risco);
        risco.setVisibility(q.risco.isEmpty() ? View.GONE : View.VISIBLE);

        final boolean temPosicao = q.lat != 0d || q.lng != 0d;
        mapa.atualizar(q.rota, q.lat, q.lng, temPosicao);
    }

    /* ============================================================== *
     * Tela — montada em código para não depender de tema/recurso novo
     * ============================================================== */

    private View montarTela() {
        final LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setBackgroundColor(Color.parseColor("#050505"));
        final int pad = dp(20);
        raiz.setPadding(pad, dp(48), pad, dp(32));

        // Prioridade visual: MANOBRA → MAPA → RISCO → SOS.
        distancia = texto("", 34, "#D4AF37", true);
        raiz.addView(distancia);

        manobra = texto("", 26, "#F5F5F5", true);
        raiz.addView(manobra);

        destino = texto("", 13, "#9AA0A6", false);
        raiz.addView(destino);

        mapa = new MapaTilesView(this);
        final LinearLayout.LayoutParams lpMapa =
                new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        lpMapa.topMargin = dp(16);
        lpMapa.bottomMargin = dp(12);
        raiz.addView(mapa, lpMapa);

        telemetria = texto("", 16, "#F5F5F5", true);
        raiz.addView(telemetria);

        risco = texto("", 13, "#D92323", true);
        raiz.addView(risco);

        sos = texto("SEGURE PARA PEDIR SOCORRO", 15, "#FFFFFF", true);
        sos.setGravity(Gravity.CENTER);
        sos.setBackgroundColor(Color.parseColor("#D92323"));
        sos.setPadding(dp(16), dp(18), dp(16), dp(18));
        final LinearLayout.LayoutParams lpSos =
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT);
        lpSos.topMargin = dp(16);
        raiz.addView(sos, lpSos);
        sos.setOnTouchListener(this::aoTocarSos);

        return raiz;
    }

    /**
     * SOS na tela de bloqueio.
     *
     * Não abre um segundo caminho de emergência: publica o pedido, e quem
     * dispara é o MESMO controlador de SOS do app. Se o app não puder atender
     * naquele instante, o texto diz a verdade em vez de fingir envio.
     */
    private boolean aoTocarSos(View v, MotionEvent e) {
        if (sosPedido) return true;
        switch (e.getAction()) {
            case MotionEvent.ACTION_DOWN:
                pressionadoEm = SystemClock.elapsedRealtime();
                sos.setText("SEGURANDO…");
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                final long segurado = SystemClock.elapsedRealtime() - pressionadoEm;
                if (segurado >= SEGURAR_SOS_MS) {
                    sosPedido = true;
                    sos.setText("SOCORRO ACIONADO");
                    LockNavigationState.pedirSos();
                } else {
                    sos.setText("SEGURE PARA PEDIR SOCORRO");
                }
                return true;
            default:
                return false;
        }
    }

    private TextView texto(String valor, int sp, String cor, boolean negrito) {
        final TextView t = new TextView(this);
        t.setText(valor);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(Color.parseColor(cor));
        if (negrito) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        t.setMaxLines(2);
        return t;
    }

    private int dp(int valor) {
        return (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, valor, getResources().getDisplayMetrics());
    }
}
