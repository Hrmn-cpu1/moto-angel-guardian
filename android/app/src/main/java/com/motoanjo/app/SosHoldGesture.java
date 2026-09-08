package com.motoanjo.app;

/** Um gesto cancelado, curto ou sem início nunca pode pedir socorro. */
final class SosHoldGesture {
    private final long minimumMs;
    private Long startedAt;

    SosHoldGesture(long minimumMs) {
        this.minimumMs = minimumMs;
    }

    void press(long now) {
        startedAt = now;
    }

    void cancel() {
        startedAt = null;
    }

    boolean release(long now) {
        final Long start = startedAt;
        cancel();
        return start != null && now >= start && now - start >= minimumMs;
    }
}
