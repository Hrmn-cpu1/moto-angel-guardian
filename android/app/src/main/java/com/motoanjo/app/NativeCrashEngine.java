package com.motoanjo.app;

/** Deterministic crash signature. Unknown, stale or inaccurate GPS never proves immobility. */
public final class NativeCrashEngine {
    public static final long GPS_MAX_AGE_MS = 15_000L;
    public static final long COUNTDOWN_MS = 15_000L;
    private String phase = "normal";
    private long impactAt = -1, dropAt = -1, stillAt = -1;
    private long movingAt = -1;
    private Double previousSpeed;

    public String phase() { return phase; }
    public void reset() {
        phase = "normal";
        impactAt = dropAt = stillAt = movingAt = -1;
        previousSpeed = null;
    }
    public String sample(long now, Double speedKmh, double accuracyM, long fixAgeMs,
                         double accel, double gyro) {
        if ("countdown".equals(phase)) return phase;
        // GPS recovery much later cannot resurrect an old crash signature.
        if ("candidate".equals(phase) && now - Math.max(impactAt, dropAt) > 30_000L) reset();
        boolean reliable = speedKmh != null && Double.isFinite(speedKmh) && speedKmh >= 0
                && Double.isFinite(accuracyM) && accuracyM >= 0 && accuracyM <= 50
                && fixAgeMs >= 0 && fixAgeMs <= GPS_MAX_AGE_MS;
        if (!reliable) {
            // A missing observation cannot advance or bridge the six-second stationary proof.
            if ("candidate".equals(phase)) stillAt = -1;
            previousSpeed = null;
            expire(now);
            return phase;
        }
        if (speedKmh >= 15) movingAt = now;
        boolean wasMoving = movingAt >= 0 && now - movingAt <= 15_000;
        if ((accel >= 25 || gyro >= 250) && wasMoving) {
            impactAt = now;
            if ("normal".equals(phase)) phase = "anomaly";
        }
        if (previousSpeed != null && previousSpeed - speedKmh >= 12 && speedKmh <= 3 && wasMoving) {
            dropAt = now;
            if ("normal".equals(phase)) phase = "anomaly";
        }
        previousSpeed = speedKmh;
        if (impactAt >= 0 && dropAt >= 0 && Math.abs(impactAt - dropAt) <= 4000
                && "anomaly".equals(phase)) {
            phase = "candidate";
            stillAt = now;
        }
        if ("candidate".equals(phase)) {
            if (speedKmh > 3) { reset(); previousSpeed = speedKmh; if (speedKmh >= 15) movingAt = now; }
            else if (stillAt < 0) stillAt = now;
            else if (now - stillAt >= 6000) phase = "countdown";
        }
        expire(now);
        return phase;
    }
    private void expire(long now) {
        if ("anomaly".equals(phase) && now - Math.max(impactAt, dropAt) > 8000) reset();
    }
}
