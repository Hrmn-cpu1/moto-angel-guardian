package com.motoanjo.app;

import java.net.URI;

/** Credential-bearing requests are restricted to the configured app's exact HTTPS origin. */
public final class NativeProtectionPolicy {
    private NativeProtectionPolicy() {}
    public static void validateEndpoint(String endpoint, String appUrl) {
        try {
            URI target = new URI(endpoint), app = new URI(appUrl);
            if (!"https".equalsIgnoreCase(target.getScheme()) || !"https".equalsIgnoreCase(app.getScheme())
                    || target.getHost() == null || !target.getHost().equalsIgnoreCase(app.getHost())
                    || port(target) != port(app) || target.getUserInfo() != null
                    || target.getQuery() != null || target.getFragment() != null
                    || !"/api/native/sos".equals(target.getRawPath())) throw new IllegalArgumentException();
        } catch (Exception e) { throw new IllegalArgumentException("Destino de proteção inválido."); }
    }
    public enum Reply { INVALID, ACTIVE, CLOSED }
    private static boolean uuid(String value) {
        try { return value != null && java.util.UUID.fromString(value).toString().equalsIgnoreCase(value); }
        catch (IllegalArgumentException e) { return false; }
    }
    public static Reply classifyReply(String pendingRequestId, String returnedRequestId,
            String eventId, String status, boolean reused) {
        if (!uuid(pendingRequestId) || !uuid(returnedRequestId) || !uuid(eventId)
                || (!pendingRequestId.equals(returnedRequestId) && !reused)) return Reply.INVALID;
        if ("active".equals(status)) return Reply.ACTIVE;
        if ("cancelled".equals(status) || "resolved".equals(status)) return Reply.CLOSED;
        return Reply.INVALID;
    }
    public static boolean matchesExpectedRequest(String expectedSessionId, String expectedRequestId,
            String currentSessionId, String currentRequestId) {
        return uuid(expectedSessionId) && uuid(expectedRequestId)
                && expectedSessionId.equals(currentSessionId) && expectedRequestId.equals(currentRequestId);
    }
    public static boolean canClearProtection(boolean preservePending, boolean diagnostic,
            String phase, String requestId, String eventId) {
        return !preservePending || diagnostic
                || (!"countdown".equals(phase) && !(requestId != null && eventId == null));
    }
    public static boolean canCancelAlert(String requestId, String eventId, boolean inFlight) {
        // A recovered request may already exist remotely, even if the process lost its attempt counter.
        return requestId == null && eventId == null && !inFlight;
    }
    public static boolean matchesClosedEvidence(String closedEventId, String nativeEventId, boolean inFlight) {
        return !inFlight && uuid(closedEventId) && closedEventId.equals(nativeEventId);
    }
    private static int port(URI uri) { return uri.getPort() == -1 ? 443 : uri.getPort(); }
}
