package com.motoanjo.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class MotionPeakWindowTest {
    @Test public void shortImpactSurvivesUntilEmission() {
        MotionPeakWindow w = new MotionPeakWindow();
        w.acceleration(40); w.acceleration(1); w.rotation(300); w.rotation(0);
        assertArrayEquals(new double[] {40, 300}, w.drain(), 0);
        assertArrayEquals(new double[] {-1, -1}, w.drain(), 0);
    }
    @Test public void nonFiniteSampleCannotPoisonWindow() {
        MotionPeakWindow w = new MotionPeakWindow();
        w.acceleration(Double.NaN); w.acceleration(27); w.rotation(Double.POSITIVE_INFINITY);
        assertArrayEquals(new double[] {27, -1}, w.drain(), 0);
    }
}
