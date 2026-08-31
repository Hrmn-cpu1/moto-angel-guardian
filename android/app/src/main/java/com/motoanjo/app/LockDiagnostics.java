package com.motoanjo.app;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

/** Buffer local e temporário do diagnóstico P0.1c. Disponível somente em builds debug. */
public final class LockDiagnostics {

    private static final String TAG = "MOTOANJO_LOCK";
    private static final String PREFS = "motoanjo_lock_diagnostics";
    private static final String CHAVE = "eventos";
    private static final int LIMITE = 50;

    private LockDiagnostics() {}

    /**
     * Única fonte de verdade sobre "este APK é debug?".
     *
     * BuildConfig não é gerado neste módulo (buildConfig desligado), então a
     * detecção vem do próprio ApplicationInfo: a flag FLAG_DEBUGGABLE só é
     * marcada em builds debug. Release cai em false e a instrumentação some.
     */
    public static boolean disponivel(Context contexto) {
        if (contexto == null) return false;
        try {
            final ApplicationInfo info = contexto.getApplicationContext().getApplicationInfo();
            return (info.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    public static synchronized void registrar(Context contexto, String evento) {
        registrar(contexto, evento, "");
    }

    public static synchronized void registrar(Context contexto, String evento, String detalheLogcat) {
        Log.i(TAG, detalheLogcat.isEmpty() ? evento : evento + " " + detalheLogcat);
        if (!disponivel(contexto) || !eventoPermitido(evento)) return;

        try {
            final SharedPreferences prefs = contexto.getApplicationContext()
                    .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            final JSONArray atual = lerArray(prefs);
            final JSONArray proximo = new JSONArray();
            final int inicio = Math.max(0, atual.length() - (LIMITE - 1));
            for (int i = inicio; i < atual.length(); i++) proximo.put(atual.getJSONObject(i));

            final JSONObject item = new JSONObject();
            item.put("evento", evento);
            item.put("quandoMs", System.currentTimeMillis());
            proximo.put(item);
            prefs.edit().putString(CHAVE, proximo.toString()).apply();
        } catch (Exception ignored) {
            // Diagnóstico nunca interfere na viagem nem na abertura da Activity.
        }
    }

    public static synchronized JSONArray listar(Context contexto) {
        if (!disponivel(contexto)) return new JSONArray();
        return lerArray(contexto.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE));
    }

    public static synchronized void limpar(Context contexto) {
        if (!disponivel(contexto)) return;
        contexto.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(CHAVE)
                .apply();
    }

    private static JSONArray lerArray(SharedPreferences prefs) {
        try {
            return new JSONArray(prefs.getString(CHAVE, "[]"));
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private static boolean eventoPermitido(String evento) {
        return evento.equals("SERVICE_STARTED")
                || evento.equals("SCREEN_RECEIVER_REGISTERED")
                || evento.equals("SCREEN_OFF_RECEIVED")
                || evento.equals("SCREEN_ON_RECEIVED")
                || evento.equals("TRIP_ACTIVE=true")
                || evento.equals("TRIP_ACTIVE=false")
                || evento.equals("LOCK_NAV_INTENT_CREATED")
                || evento.equals("START_ACTIVITY_ATTEMPT")
                || evento.equals("START_ACTIVITY_SUCCESS")
                || evento.equals("START_ACTIVITY_EXCEPTION")
                || evento.equals("LOCK_ACTIVITY_ON_CREATE")
                || evento.equals("LOCK_ACTIVITY_ON_START")
                || evento.equals("LOCK_ACTIVITY_ON_RESUME")
                || evento.equals("LOCK_ACTIVITY_ON_PAUSE")
                || evento.equals("LOCK_ACTIVITY_ON_STOP")
                || evento.equals("LOCK_ACTIVITY_ON_DESTROY")
                || evento.equals("LOCK_ACTIVITY_ALREADY_UP")
                // Fase A/B: medem latência de aparição e prova de mapa real.
                || evento.equals("FIRST_STATE_RENDER")
                || evento.equals("MAP_READY");
    }
}