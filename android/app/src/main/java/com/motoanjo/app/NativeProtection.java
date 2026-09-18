package com.motoanjo.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Android owns emergency execution during a trip; React is a subscriber, never its scheduler. */
public final class NativeProtection {
    public static final String ACTION_CANCEL = "com.motoanjo.app.NATIVE_CRASH_CANCEL";
    public static final String ACTION_HELP = "com.motoanjo.app.NATIVE_SOS_HELP";
    private static final int NOTICE = 4202;
    private static final String CHANNEL = "moto_anjo_crash_v1";
    private static NativeProtection instance;
    public interface Listener { void changed(JSObject state); }
    public static synchronized NativeProtection get(Context context) {
        if (instance == null) instance = new NativeProtection(context.getApplicationContext());
        return instance;
    }
    private final Context context;
    private final NativeProtectionStore store;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();
    private final NativeCrashEngine engine = new NativeCrashEngine();
    private String token, endpoint, userId, expiresAt, sessionId, requestId, sosEventId, externalSosId;
    private String source = "manual", phase = "normal", error;
    private long expiresMs, tripStartedAt, countdownEnd, retryAt, generation, wakeRenewAt;
    private boolean tripRunning, sensors, inFlight, tickStarted, diagnostic, permanentFailure;
    private boolean cpuLeaseAllowed = true;
    private int attempts;
    private Location location;
    private PowerManager.WakeLock wake;
    private HttpURLConnection connection;
    private ConnectivityManager.NetworkCallback networkCallback;

    private NativeProtection(Context context) {
        this.context = context; store = new NativeProtectionStore(context);
        createChannel();
        // Recovery only restores a request. Nothing is armed until the foreground trip resumes.
        try {
            JSONObject saved = store.read();
            if (saved != null && saved.optLong("expiresMs") > System.currentTimeMillis()) {
                token = saved.getString("token"); endpoint = saved.getString("endpoint");
                userId = saved.getString("userId"); expiresAt = saved.getString("expiresAt");
                sessionId = saved.optString("sessionId", null); expiresMs = saved.getLong("expiresMs");
                tripStartedAt = saved.getLong("tripStartedAt");
                requestId = nullable(saved, "requestId"); sosEventId = nullable(saved, "sosEventId");
                source = saved.optString("source", "manual");
                phase = sosEventId != null ? "registered" : requestId != null ? "failed" : "normal";
                if (requestId != null && sosEventId == null) error = "Pedido preservado. Aguardando retomar a viagem e obter GPS.";
            } else store.clear();
        } catch (Exception ignored) { store.clear(); error = "Não foi possível recuperar a proteção. Abra o aplicativo para configurar."; }
    }
    private static String nullable(JSONObject o, String key) { return o.isNull(key) ? null : o.optString(key, null); }
    public void addListener(Listener listener) { listeners.add(listener); }
    public void removeListener(Listener listener) { listeners.remove(listener); }
    public synchronized boolean configured() { return token != null && expiresMs > System.currentTimeMillis(); }
        /**
     * Sensor detection must not depend on POST_NOTIFICATIONS.
     * Notification permission only controls the visible warning; disabling it
     * must not disable the safety pipeline itself.
     */
    private boolean canDetect() { return configured() && tripRunning && sensors && cpuLeaseAllowed && !permanentFailure; }
    public synchronized JSObject snapshot() {
        JSObject s = new JSObject();
        s.put("supported", true); s.put("configured", configured()); s.put("armed", canDetect());
        s.put("sensoresDisponiveis", sensors); s.put("phase", phase); s.put("diagnostic", diagnostic);
        s.put("needsReconfiguration", permanentFailure);
        if (userId != null) s.put("userId", userId);
        if (sessionId != null) s.put("sessionId", sessionId);
        if (tripStartedAt > 0) s.put("tripStartedAt", tripStartedAt);
        if (expiresAt != null) s.put("expiresAt", expiresAt);
        if ("countdown".equals(phase)) s.put("countdownEndsAt", System.currentTimeMillis() + Math.max(0, countdownEnd - SystemClock.elapsedRealtime()));
        if (requestId != null) s.put("requestId", requestId);
        if (sosEventId != null) s.put("sosEventId", sosEventId);
        if (error != null) s.put("error", error);
        return s;
    }
    public synchronized JSObject configure(String newToken, String newEndpoint, String expiry,
            String owner, long startedAt, boolean enabled, String newSessionId, String appUrl) throws Exception {
        if (!enabled) { clear(); return snapshot(); }
        NativeProtectionPolicy.validateEndpoint(newEndpoint, appUrl);
        long deadline = parseExpiry(expiry);
        if (newToken == null || newToken.length() < 16 || newToken.length() > 4096
                || newToken.contains("\n") || newToken.contains("\r") || owner == null || owner.isEmpty()
                || startedAt <= 0 || startedAt > System.currentTimeMillis() + 5000
                || deadline <= System.currentTimeMillis() || deadline > System.currentTimeMillis() + 13 * 3600_000L)
            throw new IllegalArgumentException("Configuração de proteção inválida ou expirada.");
        boolean sameTrip = owner.equals(userId) && startedAt == tripStartedAt;
        if (!sameTrip) clear();
        else if (!newToken.equals(token)) {
            // A response for the rotated bearer must not poison the new session.
            generation++;
            if (connection != null) connection.disconnect();
            connection = null; inFlight = false; attempts = 0; retryAt = 0;
        }
        token = newToken; endpoint = newEndpoint; expiresAt = expiry; expiresMs = deadline;
        userId = owner; tripStartedAt = startedAt; sessionId = newSessionId; permanentFailure = false; cpuLeaseAllowed = true;
        try { persist(); } catch (Exception e) { clear(); throw new IllegalStateException("Não foi possível proteger as credenciais no aparelho."); }
        startTick();
        if (tripRunning && requestId != null && sosEventId == null && !inFlight) attempt();
        changed(); return snapshot();
    }
    private static long parseExpiry(String value) throws Exception {
        if (value == null) throw new IllegalArgumentException();
        for (String pattern : new String[] { "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX" }) {
            SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.US); f.setLenient(false); f.setTimeZone(TimeZone.getTimeZone("UTC"));
            try { Date d = f.parse(value); if (d != null) return d.getTime(); } catch (java.text.ParseException ignored) { }
        }
        throw new IllegalArgumentException("Validade inválida.");
    }
    public synchronized void tripStarted() { tripRunning = true; registerNetwork(); startTick(); changed(); }
    public synchronized void sensors(boolean available) { sensors = available; changed(); }
    public synchronized void position(Location fix) {
        location = fix == null ? null : new Location(fix);
        if (configured() && tripRunning && requestId != null && sosEventId == null && !inFlight && attempts < 3
                && retryAt == 0) attempt();
    }
    public synchronized void motion(double acceleration, double rotation, long now) {
        if (!canDetect() || externalSosId != null || requestId != null || "countdown".equals(phase)) return;
        long age = ageOfFix();
        Double speed = location != null && location.hasSpeed() ? (double) location.getSpeed() * 3.6 : null;
        double accuracy = location != null && location.hasAccuracy() ? location.getAccuracy() : -1;
        String next = engine.sample(now, speed, accuracy, age, acceleration, rotation);
        if (!next.equals(phase)) {
            phase = next;
            if ("countdown".equals(next)) countdownEnd = now + NativeCrashEngine.COUNTDOWN_MS;
            changed();
        }
    }
    public synchronized JSObject updateExternalSos(String id, String closedEventId) {
        // null alone can mean offline recovery, never proof that an event ended.
        if (NativeProtectionPolicy.matchesClosedEvidence(closedEventId, sosEventId, inFlight)) {
            closeRegisteredRequest(closedEventId);
        }
        externalSosId = id;
        if (id != null && requestId == null) { engine.reset(); phase = "normal"; countdownEnd = 0; changed(); }
        return snapshot();
    }
    private void closeRegisteredRequest(String closedEventId) {
        generation++;
        if (closedEventId != null && closedEventId.equals(externalSosId)) externalSosId = null;
        requestId = sosEventId = null; attempts = 0; retryAt = countdownEnd = 0;
        permanentFailure = false; phase = "cancelled"; engine.reset();
        error = "SOS encerrado no servidor.";
        try { persist(); } catch (Exception e) { error = "SOS encerrado no servidor. Não foi possível salvar o encerramento no aparelho."; }
        changed();
    }
    public synchronized JSObject cancelAlert() throws Exception {
        if (!NativeProtectionPolicy.canCancelAlert(requestId, sosEventId, inFlight)) throw new IllegalStateException("Confira e cancele o SOS registrado no aplicativo.");
        generation++; requestId = null; attempts = 0; retryAt = 0; countdownEnd = 0;
        engine.reset(); phase = "cancelled"; error = null; diagnostic = false;
        if (configured()) persist(); changed(); return snapshot();
    }
    public synchronized JSObject startDiagnostic() throws Exception {
        if ((context.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) == 0 || !tripRunning || requestId != null || externalSosId != null)
            throw new IllegalStateException("Diagnóstico indisponível.");
        diagnostic = true; phase = "countdown"; error = "Diagnóstico: nenhum SOS será enviado.";
        countdownEnd = SystemClock.elapsedRealtime() + NativeCrashEngine.COUNTDOWN_MS;
        startTick(); changed(); return snapshot();
    }
    public synchronized JSObject requestHelp(String origin) throws Exception {
        if (diagnostic) {
            diagnostic = false; phase = "cancelled"; countdownEnd = 0; engine.reset();
            error = "Diagnóstico concluído. Nenhum SOS foi enviado."; changed(); return snapshot();
        }
        if (!configured() || !tripRunning || permanentFailure) throw new IllegalStateException("Proteção nativa indisponível. Abra o aplicativo.");
        if (externalSosId != null) { sosEventId = externalSosId; phase = "registered"; changed(); return snapshot(); }
        if (requestId == null) { requestId = UUID.randomUUID().toString(); source = "crash".equals(origin) ? "crash" : "manual"; }
        if (sosEventId != null || inFlight) return snapshot();
        countdownEnd = 0; error = null; attempts = 0; retryAt = 0;
        try { persist(); } catch (Exception e) { phase = "failed"; error = "Não foi possível preservar o pedido no aparelho."; changed(); throw e; }
        attempt(); return snapshot();
    }
    /** The guard and clear share the same monitor as sensor, countdown and HTTP state changes. */
    public synchronized void clear(boolean preservePending) {
        clear(preservePending, null, null);
    }
    public synchronized void clear(boolean preservePending, String expectedSessionId, String expectedRequestId) {
        if ((expectedSessionId != null || expectedRequestId != null)
                && !NativeProtectionPolicy.matchesExpectedRequest(expectedSessionId, expectedRequestId, sessionId, requestId)) {
            throw new IllegalArgumentException("A proteção mudou enquanto o cancelamento era confirmado. Confira o pedido atual.");
        }
        if (!NativeProtectionPolicy.canClearProtection(preservePending, diagnostic, phase, requestId, sosEventId)) {
            throw new IllegalStateException("Há um pedido de SOS pendente. Confira ou cancele o pedido antes de encerrar a viagem.");
        }
        clear();
    }
    public synchronized void clear() {
        generation++;
        if (connection != null) connection.disconnect(); connection = null;
        inFlight = false; token = endpoint = userId = expiresAt = sessionId = requestId = sosEventId = externalSosId = null;
        expiresMs = tripStartedAt = countdownEnd = retryAt = 0; attempts = 0;
        engine.reset(); phase = "normal"; error = null; diagnostic = false; permanentFailure = false; store.clear(); releaseWake(); changed();
    }
    public synchronized void tripStopped() {
        tripRunning = false; sensors = false; location = null;
        clear(); main.removeCallbacks(tick); tickStarted = false;
        if (networkCallback != null) {
            try { ((ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE)).unregisterNetworkCallback(networkCallback); } catch (Exception ignored) { }
            networkCallback = null;
        }
    }
    private void persist() throws Exception {
        if (token == null) { store.clear(); return; }
        store.save(new JSONObject().put("token", token).put("endpoint", endpoint).put("expiresAt", expiresAt)
                .put("expiresMs", expiresMs).put("userId", userId).put("tripStartedAt", tripStartedAt)
                .put("sessionId", sessionId).put("requestId", requestId).put("sosEventId", sosEventId).put("source", source));
    }
    private long ageOfFix() {
        if (location == null || location.getElapsedRealtimeNanos() <= 0) return Long.MAX_VALUE;
        return (SystemClock.elapsedRealtimeNanos() - location.getElapsedRealtimeNanos()) / 1_000_000L;
    }
    private synchronized void attempt() {
        if (!configured() || !tripRunning || permanentFailure || inFlight || requestId == null || sosEventId != null || attempts >= 3) return;
        long age = ageOfFix();
        if (location == null || age < 0 || age > 60_000 || !location.hasAccuracy() || location.getAccuracy() > 500
                || location.getAccuracy() < 0 || location.isFromMockProvider()
                || !Double.isFinite(location.getLatitude()) || !Double.isFinite(location.getLongitude())) {
            phase = "failed"; error = "Aguardando localização real recente. Se precisar, ligue para a emergência."; changed(); return;
        }
        final String capturedToken = token, target = endpoint, rid = requestId;
        final long revision = generation;
        final long capturedAt = SystemClock.elapsedRealtime();
        final long capturedFixAge = age;
        final JSONObject body = new JSONObject();
        try {
            body.put("requestId", rid).put("lat", location.getLatitude()).put("lng", location.getLongitude())
                    .put("accuracy", location.getAccuracy()).put("fixAgeMs", age).put("source", source);
            persist();
        } catch (Exception e) { phase = "failed"; error = "Não foi possível preservar o pedido."; changed(); return; }
        attempts++; inFlight = true; phase = "registering"; error = null; changed();
        worker.execute(() -> {
            JSONObject result = null; int code = 0;
            HttpURLConnection http = null;
            try {
                synchronized (NativeProtection.this) { if (revision != generation || !configured() || !tripRunning) return; }
                http = (HttpURLConnection) new URL(target).openConnection();
                http.setInstanceFollowRedirects(false); http.setRequestMethod("POST"); http.setConnectTimeout(10_000); http.setReadTimeout(15_000);
                http.setRequestProperty("Authorization", "Bearer " + capturedToken); http.setRequestProperty("Content-Type", "application/json");
                http.setDoOutput(true);
                synchronized (NativeProtection.this) { if (revision != generation) return; connection = http; }
                body.put("fixAgeMs", capturedFixAge + Math.max(0, SystemClock.elapsedRealtime() - capturedAt));
                try (java.io.OutputStream out = http.getOutputStream()) { out.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
                code = http.getResponseCode();
                if (code >= 200 && code < 300) {
                    try (InputStream input = http.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                        byte[] buffer = new byte[2048]; int n;
                        while ((n = input.read(buffer)) != -1) { if (bytes.size() + n > 32_768) throw new java.io.IOException(); bytes.write(buffer, 0, n); }
                        result = new JSONObject(bytes.toString("UTF-8"));
                    }
                }
            } catch (Exception ignored) { /* No tokens, response bodies or coordinates in logs. */ }
            finally { if (http != null) http.disconnect(); }
            final JSONObject response = result; final int status = code;
            main.post(() -> finishRequest(revision, rid, response, status));
        });
    }
    private synchronized void finishRequest(long revision, String rid, JSONObject response, int status) {
        if (revision != generation || !rid.equals(requestId)) return;
        connection = null; inFlight = false;
        NativeProtectionPolicy.Reply reply = response == null ? NativeProtectionPolicy.Reply.INVALID
                : NativeProtectionPolicy.classifyReply(rid, response.optString("requestId"),
                    response.optString("sosEventId"), response.optString("status"), response.optBoolean("reused"));
        if (reply == NativeProtectionPolicy.Reply.CLOSED) {
            closeRegisteredRequest(response.optString("sosEventId"));
            return;
        }
        if (reply == NativeProtectionPolicy.Reply.ACTIVE) {
            requestId = response.optString("requestId");
            sosEventId = response.optString("sosEventId");
            phase = "registered"; error = null; retryAt = 0;
            try { persist(); } catch (Exception e) { error = "Registrado no servidor. Reabra o aplicativo para conferir."; }
        } else {
            phase = "failed";
            boolean rejected = status >= 400 && status < 500 && status != 408 && status != 429;
            if (rejected) { attempts = 3; permanentFailure = true; }
            error = status == 401 || status == 403 ? "Autorização expirada ou encerrada. Abra o aplicativo."
                    : rejected ? "O servidor recusou o registro. Confira no aplicativo."
                    : "Registro ainda sem confirmação. O mesmo pedido será consultado novamente.";
            retryAt = !rejected && attempts < 3 ? SystemClock.elapsedRealtime() + attempts * 10_000L : 0;
        }
        changed();
    }
    private void registerNetwork() {
        if (networkCallback != null) return;
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) {
                main.post(() -> { synchronized (NativeProtection.this) {
                    if (configured() && tripRunning && !permanentFailure && requestId != null && sosEventId == null && !inFlight) {
                        attempts = 0; retryAt = 0; attempt();
                    }
                }});
            }
        };
        try { cm.registerNetworkCallback(new NetworkRequest.Builder().addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), networkCallback); }
        catch (Exception e) { networkCallback = null; }
    }
    private final Runnable tick = new Runnable() {
        @Override public void run() { synchronized (NativeProtection.this) {
            if (!tripRunning && !configured()) { tickStarted = false; return; }
            if (diagnostic && tripRunning) {
                ensureWake();
                if (SystemClock.elapsedRealtime() >= countdownEnd) {
                    diagnostic = false; phase = "cancelled"; countdownEnd = 0; engine.reset();
                    error = "Diagnóstico concluído. Nenhum SOS foi enviado.";
                }
                changed();
            } else if (!configured()) {
                releaseWake();
                if (token != null) { generation++; if (connection != null) connection.disconnect(); connection = null; inFlight = false; token = null; store.clear(); phase = "failed"; error = "Proteção expirada. Abra o aplicativo para renovar."; changed(); }
            } else if (tripRunning) {
                if (canDetect() || inFlight || "countdown".equals(phase)) ensureWake(); else releaseWake();
                if ("countdown".equals(phase)) {
                    if (!notificationAllowed()) { engine.reset(); phase = "failed"; countdownEnd = 0; error = "Notificações desligadas. Alerta automático interrompido; abra o aplicativo."; changed(); }
                    else if (externalSosId != null) { engine.reset(); phase = "normal"; countdownEnd = 0; changed(); }
                    else if (SystemClock.elapsedRealtime() >= countdownEnd) {
                        try { requestHelp("crash"); } catch (Exception e) { phase = "failed"; error = "Não foi possível registrar. Abra o aplicativo."; changed(); }
                    } else changed();
                }
                if (retryAt > 0 && SystemClock.elapsedRealtime() >= retryAt) { retryAt = 0; attempt(); }
            }
            main.postDelayed(this, 1000);
        }}
    };
    private void startTick() { if (!tickStarted) { tickStarted = true; main.post(tick); } }
    private void ensureWake() {
        long now = SystemClock.elapsedRealtime();
        if (wake != null && wake.isHeld() && now < wakeRenewAt) return;
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        try {
            if (wake == null) { wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MotoAnjo:ActiveProtection"); wake.setReferenceCounted(false); }
            wake.acquire(120_000L); wakeRenewAt = now + 60_000L;
        } catch (RuntimeException e) {
            cpuLeaseAllowed = false;
            if (!inFlight && requestId == null) {
                phase = "failed"; countdownEnd = 0; engine.reset(); diagnostic = false;
                error = "O Android não permitiu manter a proteção com a tela apagada. Abra o aplicativo."; changed();
            }
        }
    }
    private void releaseWake() { if (wake != null && wake.isHeld()) wake.release(); wakeRenewAt = 0; }
    private void changed() {
        final JSObject state = snapshot();
        main.post(() -> { synchronized (NativeProtection.this) { updateNotification(); } for (Listener l : listeners) l.changed(state); });
    }
    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) { NotificationChannel c = new NotificationChannel(CHANNEL, "Possível queda e SOS", NotificationManager.IMPORTANCE_HIGH); c.setDescription("Confirmação de possível queda durante uma viagem ativa"); nm.createNotificationChannel(c); }
        }
    }
    private boolean notificationAllowed() {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel c = nm == null ? null : nm.getNotificationChannel(CHANNEL);
            return c != null && c.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        return true;
    }
    private PendingIntent action(String action, int requestCode) {
        Intent intent = new Intent(context, ViagemSeguraService.class).setAction(action);
        return PendingIntent.getService(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private void updateNotification() {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (!tripRunning || "normal".equals(phase) || "anomaly".equals(phase) || "candidate".equals(phase) || "cancelled".equals(phase)) { nm.cancel(NOTICE); return; }
        boolean countdown = "countdown".equals(phase);
        String title = diagnostic ? "TESTE — nenhum SOS será enviado" : countdown ? "Você está bem?" : "registered".equals(phase) ? "SOS registrado" : "registering".equals(phase) ? "Registrando SOS…" : "SOS sem confirmação";
        String text = countdown ? "Possível queda. SOS em " + Math.max(0, (countdownEnd - SystemClock.elapsedRealtime() + 999) / 1000) + " s."
                : error != null ? error : "Confira a entrega aos contatos no aplicativo.";
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle(title).setContentText(text).setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setOnlyAlertOnce(true).setOngoing(countdown || inFlight).setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(PendingIntent.getActivity(context, NOTICE, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        if (countdown) b.addAction(0, "Estou bem", action(ACTION_CANCEL, 4203)).addAction(0, "Preciso de ajuda", action(ACTION_HELP, 4204));
        try { nm.notify(NOTICE, b.build()); } catch (SecurityException ignored) { }
    }
}
