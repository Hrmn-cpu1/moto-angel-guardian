package com.motoanjo.app;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    /**
     * Registra a ponte da Viagem Segura antes de o WebView subir. Sem isto o
     * plugin não existe para o JavaScript e o serviço nunca é acionado.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ViagemSeguraPlugin.class);
        registerPlugin(DaisySpeechPlugin.class);
        registerPlugin(DaisyTtsPlugin.class);
        super.onCreate(savedInstanceState);
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                // A página de erro não tem plugins. O destino vem da mesma
                // configuração usada pelo APK, inclusive em domínios próprios.
                if (bridge.getErrorUrl() == null || !bridge.getErrorUrl().equals(webView.getUrl())) return;
                final String url = bridge.getServerUrl();
                if (url == null || !url.startsWith("https://")) return;
                webView.evaluateJavascript(
                        "document.getElementById('retry').href = " + JSONObject.quote(url), null);
            }
        });
    }
}
