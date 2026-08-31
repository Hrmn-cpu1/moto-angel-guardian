package com.motoanjo.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.List;

/**
 * Ponte entre a Viagem Segura (React) e o serviço nativo.
 *
 * Deliberadamente minúscula: nenhum estado próprio. O estado da viagem já tem
 * fonte única em `src/lib/trip.ts`, e duplicá-lo aqui criaria exatamente a
 * divergência que o projeto já pagou caro para eliminar na camada de riders.
 * O estado do SERVIÇO, por outro lado, pertence ao Android — e vem de
 * `ViagemSeguraService`, nunca de um palpite daqui.
 *
 * O serviço só sobe quando a viagem está ativa. Não há chamada no boot do app,
 * nem no login, nem ao abrir o mapa.
 *
 * O QUE MUDOU NO RC4 E POR QUÊ
 * ----------------------------
 * Antes, `iniciar` resolvia `{ativo: true}` logo depois de disparar o Intent —
 * mesmo quando o serviço se recusava a subir por falta de permissão. O app
 * anunciava proteção em segundo plano que não existia. Agora:
 *
 *   . `iniciar` confere as pré-condições ANTES de disparar e devolve o motivo
 *     quando não dá;
 *   . o disparo é protegido (a API 31+ recusa iniciar serviço de primeiro
 *     plano vindo do segundo plano e lança exceção);
 *   . a verdade chega depois pelo evento `estado`, publicado pelo serviço;
 *   . POST_NOTIFICATIONS finalmente é pedida — no Android 13+ ela nasce
 *     negada, e sem ela a notificação da viagem simplesmente não aparece.
 */
@CapacitorPlugin(
    name = "ViagemSegura",
    permissions = {
        @Permission(alias = "notificacoes", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class ViagemSeguraPlugin extends Plugin {

    private static final String ALIAS_NOTIFICACAO = "notificacoes";

    /** A partir daqui POST_NOTIFICATIONS é permissão de runtime (Android 13). */
    private static final int API_NOTIFICACAO_RUNTIME = 33;

    /**
     * Encaminha para o JS as posições nativas e o estado real do serviço.
     *
     * É só um cano. O estado da viagem continua com fonte única no React; o
     * Android é responsável por EXECUTAR a captura durante a viagem, não por
     * decidir se há viagem.
     */
    @Override
    public void load() {
        ViagemSeguraService.definirOuvinte((lat, lng, precisaoM, velocidadeMs, quandoMs) -> {
            final JSObject p = new JSObject();
            p.put("lat", lat);
            p.put("lng", lng);
            p.put("precisaoM", precisaoM);
            p.put("velocidadeMs", velocidadeMs);
            p.put("quandoMs", quandoMs);
            notifyListeners("posicao", p);
        });

        ViagemSeguraService.definirOuvinteDeEstado((ativo, visivel, motivo) ->
                notifyListeners("estado", montarEstado(ativo, visivel, motivo)));

        // P0.1b: movimento capturado pelo serviço, não pela WebView. O plugin
        // continua sendo só cano — quem decide se houve queda é o motor no JS.
        ViagemSeguraService.definirOuvinteDeMovimento((accelMs2, gyroDegS, monotonicoMs, quandoMs) -> {
            final JSObject m = new JSObject();
            m.put("accelMs2", accelMs2);
            m.put("gyroDegS", gyroDegS);
            m.put("monotonicoMs", monotonicoMs);
            m.put("quandoMs", quandoMs);
            notifyListeners("movimento", m);
        });

        // P0.1c: SOS pedido na tela de bloqueio. NÃO abre um segundo caminho
        // de emergência — apenas avisa o app, e quem dispara é o mesmo
        // controlador de SOS que o botão manual já usa.
        LockNavigationState.definirCanalDeSos(() ->
                notifyListeners("sosTelaBloqueada", new JSObject()));
    }

    @PluginMethod
    public void iniciar(PluginCall call) {
        // Sem permissão de localização o serviço nasce morto (a API 34+ mata
        // com SecurityException). Melhor recusar aqui, com motivo, do que
        // deixar o app achar que subiu.
        if (!temPermissaoDeLocalizacao()) {
            call.resolve(recusa(ViagemSeguraService.MOTIVO_SEM_LOCALIZACAO));
            return;
        }

        final Intent i = new Intent(getContext(), ViagemSeguraService.class);
        i.setAction(ViagemSeguraService.ACAO_INICIAR);
        i.putExtra(ViagemSeguraService.EXTRA_DESTINO, call.getString("destino", ""));

        try {
            enviar(i);
        } catch (Exception e) {
            call.resolve(recusa(ViagemSeguraService.MOTIVO_FALHA_FOREGROUND));
            return;
        }

        // `solicitado` é o que sabemos AGORA; `ativo` continua vindo do serviço.
        // O estado definitivo chega pelo evento `estado`, milissegundos depois.
        final JSObject r = estadoReal();
        r.put("solicitado", true);
        call.resolve(r);
    }

    /** Atualiza o texto da notificação sem reiniciar o serviço. */
    @PluginMethod
    public void atualizar(PluginCall call) {
        final Intent i = new Intent(getContext(), ViagemSeguraService.class);
        i.setAction(ViagemSeguraService.ACAO_ATUALIZAR);

        // Só encaminha o campo que o JS realmente mandou. Chave ausente ->
        // o serviço mantém o valor anterior. Era isto que apagava o destino
        // na primeira atualização de alerta.
        copiar(call, i, ViagemSeguraService.EXTRA_DESTINO, "destino");
        copiar(call, i, ViagemSeguraService.EXTRA_ALERTA, "alerta");
        copiar(call, i, ViagemSeguraService.EXTRA_DISTANCIA, "distancia");
        copiar(call, i, ViagemSeguraService.EXTRA_MANOBRA, "manobra");

        try {
            enviar(i);
        } catch (Exception e) {
            call.resolve(recusa(ViagemSeguraService.MOTIVO_FALHA_FOREGROUND));
            return;
        }
        call.resolve(estadoReal());
    }

    /**
     * Publica o quadro de navegação para a tela de bloqueio (P0.1c).
     *
     * O app é a fonte: viagem, rota, manobra e ETA já existem lá. Aqui só
     * atravessam a ponte. Nada é calculado, nada é inventado, e nenhum dado
     * pessoal passa — a tela de bloqueio é pública por definição.
     */
    @PluginMethod
    public void navegacaoBloqueada(PluginCall call) {
        final JSArray bruta = call.getArray("rota");
        double[] rota = new double[0];
        if (bruta != null) {
            try {
                final List<Object> lista = bruta.toList();
                final int pares = lista.size() / 2;
                rota = new double[pares * 2];
                for (int i = 0; i < pares * 2; i++) {
                    final Object v = lista.get(i);
                    rota[i] = v instanceof Number ? ((Number) v).doubleValue() : 0d;
                }
            } catch (Exception e) {
                rota = new double[0];
            }
        }

        LockNavigationState.publicar(new LockNavigationState.Quadro(
                Boolean.TRUE.equals(call.getBoolean("ativa", false)),
                Boolean.TRUE.equals(call.getBoolean("permitida", false)),
                call.getString("manobra", ""),
                call.getString("distanciaManobra", ""),
                call.getString("destino", ""),
                call.getString("restante", ""),
                call.getString("eta", ""),
                call.getString("risco", ""),
                call.getDouble("lat", 0d),
                call.getDouble("lng", 0d),
                rota));
        call.resolve();
    }

    /** Fim da viagem, ou preferência desligada: nada sobra sobre o bloqueio. */
    @PluginMethod
    public void limparNavegacaoBloqueada(PluginCall call) {
        LockNavigationState.limpar();
        call.resolve();
    }

    /** Histórico local P0.1c. Release responde indisponível e nunca expõe eventos. */
    @PluginMethod
    public void diagnosticoLock(PluginCall call) {
        final JSObject r = new JSObject();
        final boolean disponivel = LockDiagnostics.disponivel(getContext());
        r.put("disponivel", disponivel);
        r.put("eventos", disponivel ? new JSArray(LockDiagnostics.listar(getContext()).toString()) : new JSArray());
        call.resolve(r);
    }

    @PluginMethod
    public void limparDiagnosticoLock(PluginCall call) {
        LockDiagnostics.limpar(getContext());
        call.resolve();
    }

    @PluginMethod
    public void parar(PluginCall call) {
        final Intent i = new Intent(getContext(), ViagemSeguraService.class);
        i.setAction(ViagemSeguraService.ACAO_PARAR);
        try {
            // Parar usa startService mesmo em API 26+: o serviço já está em
            // primeiro plano, e stopService não entregaria a ação de limpeza.
            getContext().startService(i);
        } catch (Exception e) {
            // Serviço já morto: nada a fazer, e nada a mentir.
        }
        call.resolve(estadoReal());
    }

    /** Consulta o estado real a qualquer momento (retomada do app, remount). */
    @PluginMethod
    public void consultarEstado(PluginCall call) {
        call.resolve(estadoReal());
    }

    /**
     * Estado honesto dos sensores de movimento.
     *
     * A tela usa para dizer a verdade quando o aparelho não tem acelerômetro:
     * detecção de queda indisponível é informação, não detalhe técnico.
     */
    @PluginMethod
    public void estadoSensores(PluginCall call) {
        final JSObject r = new JSObject();
        r.put("aceleracao", ViagemSeguraService.temAceleracao());
        r.put("giroscopio", ViagemSeguraService.temGiroscopio());
        r.put("capturando", ViagemSeguraService.movimentoAtivo());
        call.resolve(r);
    }

    /** Diz se a notificação pode aparecer, sem pedir nada ao usuário. */
    @PluginMethod
    public void permissaoNotificacao(PluginCall call) {
        call.resolve(montarPermissao());
    }

    /**
     * Pede POST_NOTIFICATIONS quando faz sentido pedir.
     *
     * Abaixo da API 33 não existe diálogo: a resposta é o que o sistema já diz.
     * Negada não é erro — resolve com `concedida: false` e a viagem continua em
     * primeiro plano. Nunca lança.
     */
    @PluginMethod
    public void pedirPermissaoNotificacao(PluginCall call) {
        if (Build.VERSION.SDK_INT < API_NOTIFICACAO_RUNTIME) {
            call.resolve(montarPermissao());
            return;
        }
        if (notificacaoConcedida()) {
            call.resolve(montarPermissao());
            return;
        }
        requestPermissionForAlias(ALIAS_NOTIFICACAO, call, "aoResponderNotificacao");
    }

    @PermissionCallback
    private void aoResponderNotificacao(PluginCall call) {
        call.resolve(montarPermissao());
    }

    /* ============================================================== *
     * Internos
     * ============================================================== */

    private void copiar(PluginCall call, Intent i, String extra, String chave) {
        final String v = call.getString(chave);
        if (v != null) i.putExtra(extra, v);
    }

    private void enviar(Intent i) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(i);
        } else {
            getContext().startService(i);
        }
    }

    private boolean temPermissaoDeLocalizacao() {
        return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED
                || ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;
    }

    private boolean notificacaoConcedida() {
        if (Build.VERSION.SDK_INT < API_NOTIFICACAO_RUNTIME) return podeMostrarNotificacao();
        return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    /** A permissão pode estar concedida e o canal desligado nas configurações. */
    private boolean podeMostrarNotificacao() {
        try {
            return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        } catch (Exception e) {
            return false;
        }
    }

    private JSObject montarPermissao() {
        final JSObject r = new JSObject();
        r.put("suportaRuntime", Build.VERSION.SDK_INT >= API_NOTIFICACAO_RUNTIME);
        r.put("concedida", notificacaoConcedida());
        r.put("podeMostrar", podeMostrarNotificacao());
        return r;
    }

    private JSObject montarEstado(boolean ativo, boolean visivel, String motivo) {
        final JSObject r = new JSObject();
        r.put("ativo", ativo);
        r.put("notificacaoVisivel", visivel);
        r.put("motivo", motivo);
        return r;
    }

    private JSObject estadoReal() {
        final JSObject r = montarEstado(
                ViagemSeguraService.estaAtivo(),
                podeMostrarNotificacao(),
                ViagemSeguraService.motivoAtual());
        r.put("solicitado", false);
        return r;
    }

    private JSObject recusa(String motivo) {
        final JSObject r = montarEstado(false, podeMostrarNotificacao(), motivo);
        r.put("solicitado", false);
        return r;
    }
}
