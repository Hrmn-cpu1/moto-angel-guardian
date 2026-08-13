package com.motoanjo.app;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ponte entre a Viagem Segura (React) e o serviço nativo.
 *
 * Deliberadamente minúscula: três métodos, nenhum estado próprio. O estado da
 * viagem já tem uma fonte única em `src/lib/trip.ts`, e duplicá-lo aqui criaria
 * exatamente a divergência que o projeto já pagou caro para eliminar na camada
 * de riders.
 *
 * O serviço só sobe quando a viagem está ativa. Não há chamada no boot do app,
 * nem no login, nem ao abrir o mapa.
 */
@CapacitorPlugin(name = "ViagemSegura")
public class ViagemSeguraPlugin extends Plugin {

    /**
     * Encaminha as posições nativas para o JS como evento `posicao`.
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
    }

    @PluginMethod
    public void iniciar(PluginCall call) {
        final Intent i = new Intent(getContext(), ViagemSeguraService.class);
        i.setAction(ViagemSeguraService.ACAO_INICIAR);
        i.putExtra(ViagemSeguraService.EXTRA_DESTINO, call.getString("destino", ""));
        enviar(i);
        call.resolve(estado(true));
    }

    /** Atualiza o texto da notificação sem reiniciar o serviço. */
    @PluginMethod
    public void atualizar(PluginCall call) {
        final Intent i = new Intent(getContext(), ViagemSeguraService.class);
        i.setAction(ViagemSeguraService.ACAO_ATUALIZAR);
        i.putExtra(ViagemSeguraService.EXTRA_DESTINO, call.getString("destino", ""));
        i.putExtra(ViagemSeguraService.EXTRA_ALERTA, call.getString("alerta", ""));
        i.putExtra(ViagemSeguraService.EXTRA_DISTANCIA, call.getString("distancia", ""));
        enviar(i);
        call.resolve(estado(true));
    }

    @PluginMethod
    public void parar(PluginCall call) {
        final Intent i = new Intent(getContext(), ViagemSeguraService.class);
        i.setAction(ViagemSeguraService.ACAO_PARAR);
        // Parar usa startService mesmo em API 26+: o serviço já está em
        // primeiro plano, e stopService não entregaria a ação de limpeza.
        getContext().startService(i);
        call.resolve(estado(false));
    }

    private void enviar(Intent i) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(i);
        } else {
            getContext().startService(i);
        }
    }

    private JSObject estado(boolean ativo) {
        final JSObject r = new JSObject();
        r.put("ativo", ativo);
        return r;
    }
}
