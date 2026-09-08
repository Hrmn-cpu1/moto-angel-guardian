package com.motoanjo.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class SosHoldGestureTest {
    @Test public void cancelledLongHoldNeverRequestsSos() {
        SosHoldGesture gesture = new SosHoldGesture(1500);
        gesture.press(100);
        gesture.cancel();
        assertFalse(gesture.release(3000));
    }

    @Test public void shortHoldAndReleaseWithoutPressAreIgnored() {
        SosHoldGesture gesture = new SosHoldGesture(1500);
        assertFalse(gesture.release(9000));
        gesture.press(100);
        assertFalse(gesture.release(1599));
    }

    @Test public void completedHoldRequestsExactlyOnce() {
        SosHoldGesture gesture = new SosHoldGesture(1500);
        gesture.press(100);
        assertTrue(gesture.release(1600));
        assertFalse(gesture.release(1700));
    }

    @Test public void freshHoldWorksAfterCancellation() {
        SosHoldGesture gesture = new SosHoldGesture(1500);
        gesture.press(100);
        gesture.cancel();
        gesture.press(3000);
        assertTrue(gesture.release(4500));
    }
}
