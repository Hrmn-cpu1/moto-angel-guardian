package com.motoanjo.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Registra a ponte da Viagem Segura antes de o WebView subir. Sem isto o
     * plugin não existe para o JavaScript e o serviço nunca é acionado.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ViagemSeguraPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
