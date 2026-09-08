package com.motoanjo.app;

/** Retains short impacts between bridge emissions instead of retaining only the last sample. */
public final class MotionPeakWindow {
    private double acceleration = -1, rotation = -1;
    public void acceleration(double value) { if (Double.isFinite(value)) acceleration = Math.max(acceleration, value); }
    public void rotation(double value) { if (Double.isFinite(value)) rotation = Math.max(rotation, value); }
    public double[] drain() {
        double[] result = { acceleration, rotation };
        acceleration = rotation = -1;
        return result;
    }
}
