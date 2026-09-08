package com.motoanjo.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativeCrashEngineTest {
    private NativeCrashEngine candidate() {
        NativeCrashEngine engine = new NativeCrashEngine();
        assertEquals("normal", engine.sample(1000, 30d, 5, 0, 0, 0));
        assertEquals("anomaly", engine.sample(2000, 30d, 5, 0, 30, 0));
        assertEquals("candidate", engine.sample(3000, 0d, 5, 0, 0, 0));
        return engine;
    }
    @Test public void fullSignatureRequiresSixSecondsStill() {
        NativeCrashEngine engine = candidate();
        assertEquals("candidate", engine.sample(8999, 0d, 5, 0, 0, 0));
        assertEquals("countdown", engine.sample(9000, 0d, 5, 0, 0, 0));
        assertEquals("countdown", engine.sample(10000, 30d, 5, 0, 0, 0));
    }
    @Test public void impactAtRestDoesNotArm() {
        NativeCrashEngine e = new NativeCrashEngine();
        e.sample(1000, 0d, 5, 0, 40, 500);
        assertEquals("normal", e.sample(10000, 0d, 5, 0, 0, 0));
    }
    @Test public void brakingWithoutImpactExpires() {
        NativeCrashEngine e = new NativeCrashEngine();
        e.sample(1000, 30d, 5, 0, 0, 0);
        e.sample(2000, 0d, 5, 0, 0, 0);
        assertEquals("normal", e.sample(11000, 0d, 5, 0, 0, 0));
    }
    @Test public void missingGpsCannotCompleteImmobility() {
        NativeCrashEngine e = candidate();
        assertEquals("candidate", e.sample(9000, null, 5, 0, 0, 0));
        assertEquals("candidate", e.sample(10000, 0d, 5, 0, 0, 0));
        assertEquals("candidate", e.sample(15999, 0d, 5, 0, 0, 0));
        assertEquals("countdown", e.sample(16000, 0d, 5, 0, 0, 0));
    }
    @Test public void staleAndInaccurateGpsCannotCompleteImmobility() {
        NativeCrashEngine e = candidate();
        assertEquals("candidate", e.sample(9000, 0d, 5, 15001, 0, 0));
        assertEquals("candidate", e.sample(20000, 0d, 100, 0, 0, 0));
        assertEquals("candidate", e.sample(21000, 0d, 5, 0, 0, 0));
        assertEquals("countdown", e.sample(27000, 0d, 5, 0, 0, 0));
    }
    @Test public void movementAfterImpactResetsCandidate() {
        NativeCrashEngine e = candidate();
        assertEquals("normal", e.sample(4000, 20d, 5, 0, 0, 0));
        assertEquals("anomaly", e.sample(12000, 0d, 5, 0, 0, 0));
    }
    @Test public void oldMotionDoesNotPermitLaterStationaryImpact() {
        NativeCrashEngine e = new NativeCrashEngine();
        e.sample(1000, 30d, 5, 0, 0, 0);
        assertEquals("normal", e.sample(20000, 0d, 5, 0, 40, 500));
    }
    @Test public void resetAfterCountdownAllowsNextTrip() {
        NativeCrashEngine e = candidate();
        e.sample(9000, 0d, 5, 0, 0, 0); e.reset();
        assertEquals("normal", e.sample(10000, 0d, 5, 0, 40, 0));
    }
    @Test public void rotationCanSubstituteImpactWithFullSignature() {
        NativeCrashEngine e = new NativeCrashEngine();
        e.sample(1000, 30d, 5, 0, 0, 0);
        e.sample(2000, 30d, 5, 0, 0, 300);
        e.sample(3000, 0d, 5, 0, 0, 0);
        assertEquals("countdown", e.sample(9000, 0d, 5, 0, 0, 0));
    }
    @Test public void longGpsGapCannotResurrectOldCandidate() {
        NativeCrashEngine e = candidate();
        assertEquals("normal", e.sample(34000, null, 5, 0, 0, 0));
        assertEquals("normal", e.sample(35000, 0d, 5, 0, 0, 0));
        assertEquals("normal", e.sample(41000, 0d, 5, 0, 0, 0));
    }
}
