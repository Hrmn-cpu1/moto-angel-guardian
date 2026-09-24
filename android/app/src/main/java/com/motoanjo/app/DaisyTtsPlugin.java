package com.motoanjo.app;

import android.speech.tts.TextToSpeech;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "DaisyTts")
public class DaisyTtsPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private boolean pronto;
    private String falaPendente;

    @Override
    public void load() {
        super.load();
        getActivity().runOnUiThread(() -> tts = new TextToSpeech(getContext(), this));
    }

    @Override
    public void onInit(int status) {
        pronto = status == TextToSpeech.SUCCESS;
        if (!pronto || tts == null) return;

        int resultado = tts.setLanguage(new Locale("pt", "BR"));
        pronto = resultado != TextToSpeech.LANG_MISSING_DATA
                && resultado != TextToSpeech.LANG_NOT_SUPPORTED;

        if (pronto && falaPendente != null) {
            falarAgora(falaPendente);
            falaPendente = null;
        }
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject resposta = new JSObject();
        resposta.put("available", pronto);
        call.resolve(resposta);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        final String texto = call.getString("text", "").trim();
        if (texto.isEmpty()) {
            call.reject("Texto vazio.", "DAISY_TTS_EMPTY");
            return;
        }

        getActivity().runOnUiThread(() -> {
            if (tts == null) {
                call.reject("Motor de voz indisponível.", "DAISY_TTS_UNAVAILABLE");
                return;
            }
            if (!pronto) {
                falaPendente = texto;
                call.resolve();
                return;
            }
            falarAgora(texto);
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            falaPendente = null;
            if (tts != null) tts.stop();
            call.resolve();
        });
    }

    private void falarAgora(String texto) {
        if (tts == null || !pronto) return;
        tts.stop();
        tts.setSpeechRate(1.05f);
        tts.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "daisy");
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        pronto = false;
        falaPendente = null;
        super.handleOnDestroy();
    }
}
