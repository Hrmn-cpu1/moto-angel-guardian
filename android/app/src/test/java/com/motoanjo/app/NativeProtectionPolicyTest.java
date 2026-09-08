package com.motoanjo.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class NativeProtectionPolicyTest {
    @Test public void permitsOnlyExactConfiguredHttpsOriginAndPath() {
        NativeProtectionPolicy.validateEndpoint("https://app.example/api/native/sos", "https://app.example");
        NativeProtectionPolicy.validateEndpoint("https://app.example:443/api/native/sos", "https://APP.example/login");
    }
    @Test public void rejectsCredentialExfiltrationTargets() {
        for (String endpoint : new String[] {
                "http://app.example/api/native/sos", "https://evil.example/api/native/sos",
                "https://app.example.evil.example/api/native/sos", "https://app.example:444/api/native/sos",
                "https://user@app.example/api/native/sos", "https://app.example/api/native/sos?forward=evil",
                "https://app.example/api/native/sos#frag", "https://app.example/api/native/%73os",
                "https://app.example/api/native/sos/../other", "https://app.example/other" }) {
            try { NativeProtectionPolicy.validateEndpoint(endpoint, "https://app.example"); fail(endpoint); }
            catch (IllegalArgumentException expected) { }
        }
    }
    private static final String REQUEST = "11111111-1111-4111-8111-111111111111";
    private static final String OTHER = "22222222-2222-4222-8222-222222222222";
    private static final String EVENT = "33333333-3333-4333-8333-333333333333";
    @Test public void closedHttpReplyReleasesRequestInsteadOfRegisteringAnotherSos() {
        assertEquals(NativeProtectionPolicy.Reply.CLOSED,
                NativeProtectionPolicy.classifyReply(REQUEST, REQUEST, EVENT, "cancelled", true));
        assertEquals(NativeProtectionPolicy.Reply.CLOSED,
                NativeProtectionPolicy.classifyReply(REQUEST, REQUEST, EVENT, "resolved", true));
        assertEquals(NativeProtectionPolicy.Reply.ACTIVE,
                NativeProtectionPolicy.classifyReply(REQUEST, REQUEST, EVENT, "active", false));
    }
    @Test public void unrelatedReplyCannotReleasePendingRequestWithoutReuseProof() {
        assertEquals(NativeProtectionPolicy.Reply.INVALID,
                NativeProtectionPolicy.classifyReply(REQUEST, OTHER, EVENT, "cancelled", false));
        assertEquals(NativeProtectionPolicy.Reply.CLOSED,
                NativeProtectionPolicy.classifyReply(REQUEST, OTHER, EVENT, "cancelled", true));
        assertEquals(NativeProtectionPolicy.Reply.INVALID,
                NativeProtectionPolicy.classifyReply(REQUEST, REQUEST, "1-1-1-1-1", "cancelled", true));
        assertEquals(NativeProtectionPolicy.Reply.INVALID,
                NativeProtectionPolicy.classifyReply(REQUEST, REQUEST, EVENT, "unknown", true));
    }
    @Test public void onlySpecificClosedEventEvidenceCanReleaseRegisteredLatch() {
        assertTrue(NativeProtectionPolicy.matchesClosedEvidence(EVENT, EVENT, false));
        assertFalse(NativeProtectionPolicy.matchesClosedEvidence(null, EVENT, false));
        assertFalse(NativeProtectionPolicy.matchesClosedEvidence(OTHER, EVENT, false));
        assertFalse(NativeProtectionPolicy.matchesClosedEvidence(EVENT, EVENT, true));
        assertFalse(NativeProtectionPolicy.matchesClosedEvidence(EVENT, null, false));
    }
    @Test public void recoveredUncertainRequestCannotBeCancelledOnlyOnDevice() {
        assertTrue(NativeProtectionPolicy.canCancelAlert(null, null, false));
        assertFalse(NativeProtectionPolicy.canCancelAlert(REQUEST, null, false));
        assertFalse(NativeProtectionPolicy.canCancelAlert(null, EVENT, false));
        assertFalse(NativeProtectionPolicy.canCancelAlert(null, null, true));
    }
    @Test public void tripEndProtectsCountdownAndUnconfirmedRequests() {
        assertFalse(NativeProtectionPolicy.canClearProtection(true, false, "countdown", null, null));
        assertFalse(NativeProtectionPolicy.canClearProtection(true, false, "registering", REQUEST, null));
        assertFalse(NativeProtectionPolicy.canClearProtection(true, false, "failed", REQUEST, null));
        assertTrue(NativeProtectionPolicy.canClearProtection(true, false, "normal", null, null));
        assertTrue(NativeProtectionPolicy.canClearProtection(true, false, "registered", REQUEST, EVENT));
    }
    @Test public void explicitCleanupAndDiagnosticDoNotBlockTripEnd() {
        assertTrue(NativeProtectionPolicy.canClearProtection(false, false, "countdown", null, null));
        assertTrue(NativeProtectionPolicy.canClearProtection(false, false, "failed", REQUEST, null));
        assertTrue(NativeProtectionPolicy.canClearProtection(true, true, "countdown", null, null));
    }

    @Test public void delayedCancellationCannotClearNewSessionOrNewRequest() {
        assertTrue(NativeProtectionPolicy.matchesExpectedRequest(OTHER, REQUEST, OTHER, REQUEST));
        assertFalse(NativeProtectionPolicy.matchesExpectedRequest(OTHER, REQUEST, EVENT, REQUEST));
        assertFalse(NativeProtectionPolicy.matchesExpectedRequest(OTHER, REQUEST, OTHER, EVENT));
        assertFalse(NativeProtectionPolicy.matchesExpectedRequest(OTHER, REQUEST, null, null));
        assertFalse(NativeProtectionPolicy.matchesExpectedRequest(OTHER, null, OTHER, REQUEST));
        assertFalse(NativeProtectionPolicy.matchesExpectedRequest(null, REQUEST, OTHER, REQUEST));
        assertFalse(NativeProtectionPolicy.matchesExpectedRequest("", "", "", ""));
    }

}
