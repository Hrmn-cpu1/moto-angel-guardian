package com.motoanjo.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

/**
 * Reconhecimento de voz nativo da DAISY.
 *
 * A Web Speech API não é oferecida de forma confiável pela WebView usada no
 * APK. Esta ponte usa o SpeechRecognizer do próprio Android e só abre o
 * microfone depois de um toque explícito no botão da DAISY.
 */
@CapacitorPlugin(
    name = "DaisySpeech",
    permissions = {
        @Permission(alias = "microfone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class DaisySpeechPlugin extends Plugin implements RecognitionListener {

    private static final String ALIAS_MICROFONE = "microfone";
    private static final String CODIGO_CANCELADO = "DAISY_CANCELLED";

    private SpeechRecognizer recognizer;
    private PluginCall chamadaAtiva;
    private boolean cancelando;

    /** Consulta capacidade sem abrir o microfone nem pedir permissão. */
    @PluginMethod
    public void available(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            final JSObject resposta = new JSObject();
            resposta.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
            resposta.put("permission", getPermissionState(ALIAS_MICROFONE).toString().toLowerCase(Locale.ROOT));
            call.resolve(resposta);
        });
    }

    /** Pede permissão no primeiro uso e inicia uma única escuta. */
    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState(ALIAS_MICROFONE) != PermissionState.GRANTED) {
            requestPermissionForAlias(ALIAS_MICROFONE, call, "aoResponderMicrofone");
            return;
        }
        iniciarEscuta(call);
    }

    @PermissionCallback
    private void aoResponderMicrofone(PluginCall call) {
        if (getPermissionState(ALIAS_MICROFONE) != PermissionState.GRANTED) {
            call.reject("Permissão do microfone negada.", "MICROPHONE_DENIED");
            return;
        }
        iniciarEscuta(call);
    }

    private void iniciarEscuta(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (chamadaAtiva != null) {
                call.reject("A DAISY já está ouvindo.", "DAISY_BUSY");
                return;
            }
            if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                call.reject("Reconhecimento de voz indisponível neste aparelho.", "DAISY_UNAVAILABLE");
                return;
            }

            try {
                liberarReconhecedor();
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(this);
                chamadaAtiva = call;
                cancelando = false;

                final Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(
                        RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pt-BR");
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                recognizer.startListening(intent);
            } catch (Exception e) {
                falhar("Não consegui iniciar o microfone.", "DAISY_START_FAILED");
            }
        });
    }

    /** Cancela a escuta atual; pode ser chamado repetidamente. */
    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            cancelando = true;
            try {
                if (recognizer != null) recognizer.cancel();
            } catch (Exception ignored) {
                // Encerramento idempotente.
            }
            falhar("Escuta cancelada.", CODIGO_CANCELADO);
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                cancelando = true;
                try {
                    if (recognizer != null) recognizer.cancel();
                } catch (Exception ignored) { }
                falhar("Escuta encerrada.", CODIGO_CANCELADO);
            });
        }
        super.handleOnDestroy();
    }

    @Override
    public void onResults(Bundle results) {
        final ArrayList<String> alternativas =
                results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        String texto = "";
        if (alternativas != null) {
            for (String alternativa : alternativas) {
                if (alternativa != null && !alternativa.trim().isEmpty()) {
                    texto = alternativa.trim();
                    break;
                }
            }
        }

        if (texto.isEmpty()) {
            falhar("Não entendi. Fale novamente.", "DAISY_NO_MATCH");
            return;
        }

        final PluginCall call = chamadaAtiva;
        chamadaAtiva = null;
        liberarReconhecedor();
        if (call != null) {
            final JSObject resposta = new JSObject();
            resposta.put("text", texto);
            call.resolve(resposta);
        }
    }

    @Override
    public void onError(int error) {
        if (cancelando || error == SpeechRecognizer.ERROR_CLIENT) {
            falhar("Escuta cancelada.", CODIGO_CANCELADO);
            return;
        }
        switch (error) {
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                falhar("Permissão do microfone negada.", "MICROPHONE_DENIED");
                break;
            case SpeechRecognizer.ERROR_NO_MATCH:
                falhar("Não entendi. Fale novamente.", "DAISY_NO_MATCH");
                break;
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                falhar("Não ouvi nenhuma fala. Toque e tente novamente.", "DAISY_TIMEOUT");
                break;
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                falhar("Reconhecimento de voz sem conexão.", "DAISY_NETWORK");
                break;
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                falhar("O reconhecimento de voz está ocupado. Tente novamente.", "DAISY_BUSY");
                break;
            default:
                falhar("Não consegui reconhecer sua voz.", "DAISY_RECOGNITION_FAILED");
                break;
        }
    }

    private void falhar(String mensagem, String codigo) {
        final PluginCall call = chamadaAtiva;
        chamadaAtiva = null;
        liberarReconhecedor();
        if (call != null) call.reject(mensagem, codigo);
    }

    private void liberarReconhecedor() {
        try {
            if (recognizer != null) recognizer.destroy();
        } catch (Exception ignored) { }
        recognizer = null;
    }

    @Override public void onReadyForSpeech(Bundle params) { }
    @Override public void onBeginningOfSpeech() { }
    @Override public void onRmsChanged(float rmsdB) { }
    @Override public void onBufferReceived(byte[] buffer) { }
    @Override public void onEndOfSpeech() { }
    @Override public void onPartialResults(Bundle partialResults) { }
    @Override public void onEvent(int eventType, Bundle params) { }
}
