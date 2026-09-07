package com.yamo.snorelab;

/**
 * Lightweight on-device heuristic detector used only for the V0.1 validation build.
 * It intentionally favors recall over precision so the tester can review ambiguous events.
 */
public final class SnoreDetector {
    public static final String VERSION = "heuristic-0.2";

    public static final class Result {
        public final double dbfs;
        public final double zeroCrossRate;
        public final double lowBandRatio;
        public final double periodicity;
        public final double score;
        public final double threshold;
        public final boolean candidate;

        Result(double dbfs, double zeroCrossRate, double lowBandRatio, double periodicity,
               double score, double threshold, boolean candidate) {
            this.dbfs = dbfs;
            this.zeroCrossRate = zeroCrossRate;
            this.lowBandRatio = lowBandRatio;
            this.periodicity = periodicity;
            this.score = score;
            this.threshold = threshold;
            this.candidate = candidate;
        }
    }

    private final int sensitivity; // 0..100, higher catches more

    public SnoreDetector(int sensitivity) {
        this.sensitivity = Math.max(0, Math.min(100, sensitivity));
    }

    public Result analyze(short[] samples, int sampleRate) {
        if (samples == null || samples.length < 64) {
            return new Result(-120.0, 1.0, 0.0, 0.0, 0.0, thresholdForSensitivity(), false);
        }

        double sumSq = 0.0;
        int zeroCross = 0;
        short previous = samples[0];
        for (short s : samples) {
            double n = s / 32768.0;
            sumSq += n * n;
            if ((s >= 0 && previous < 0) || (s < 0 && previous >= 0)) zeroCross++;
            previous = s;
        }

        double rms = Math.sqrt(sumSq / samples.length);
        double dbfs = 20.0 * Math.log10(Math.max(rms, 1e-8));
        double zcr = zeroCross / (double) samples.length;

        int smoothWindow = Math.max(4, sampleRate / 1000);
        double lowRatio = movingAverageEnergyRatio(samples, smoothWindow);
        double periodicity = lowFrequencyPeriodicity(samples, sampleRate);

        double loudness = clamp((dbfs + 52.0) / 28.0);
        double lowTone = clamp((lowRatio - 0.18) / 0.72);
        double periodic = clamp((periodicity - 0.12) / 0.70);
        double lowCross = clamp((0.20 - zcr) / 0.18);

        double score = 100.0 * (0.30 * loudness + 0.40 * lowTone + 0.25 * periodic + 0.05 * lowCross);
        double threshold = thresholdForSensitivity();
        boolean candidate = dbfs > -52.0 && lowRatio > 0.12 && score >= threshold;
        return new Result(dbfs, zcr, lowRatio, periodicity, score, threshold, candidate);
    }

    private double thresholdForSensitivity() {
        return 70.0 - (sensitivity * 0.25);
    }

    private static double movingAverageEnergyRatio(short[] samples, int window) {
        if (window <= 1) return 1.0;
        double raw = 0.0;
        for (short sample : samples) {
            double x = sample / 32768.0;
            raw += x * x;
        }
        if (raw < 1e-12) return 0.0;

        double[] ring = new double[window];
        int pos = 0;
        int filled = 0;
        double sum = 0.0;
        double smoothEnergy = 0.0;
        for (short sample : samples) {
            double x = sample / 32768.0;
            if (filled < window) {
                ring[pos] = x;
                sum += x;
                filled++;
            } else {
                sum -= ring[pos];
                ring[pos] = x;
                sum += x;
            }
            pos = (pos + 1) % window;
            double avg = sum / filled;
            smoothEnergy += avg * avg;
        }
        return clamp(smoothEnergy / raw);
    }

    private static double lowFrequencyPeriodicity(short[] samples, int sampleRate) {
        int factor = Math.max(1, sampleRate / 4000);
        int n = samples.length / factor;
        if (n < 100) return 0.0;
        double[] x = new double[n];
        for (int i = 0; i < n; i++) {
            double sum = 0.0;
            for (int j = 0; j < factor; j++) sum += samples[i * factor + j] / 32768.0;
            x[i] = sum / factor;
        }
        double mean = 0;
        for (double v : x) mean += v;
        mean /= n;
        double energy = 0;
        for (int i = 0; i < n; i++) {
            x[i] -= mean;
            energy += x[i] * x[i];
        }
        if (energy < 1e-10) return 0.0;

        int downRate = sampleRate / factor;
        int minLag = Math.max(2, downRate / 400);
        int maxLag = Math.min(n / 3, downRate / 50);
        double best = 0.0;
        for (int lag = minLag; lag <= maxLag; lag++) {
            double cross = 0.0, e1 = 0.0, e2 = 0.0;
            for (int i = lag; i < n; i++) {
                double a = x[i];
                double b = x[i - lag];
                cross += a * b;
                e1 += a * a;
                e2 += b * b;
            }
            double corr = cross / Math.sqrt(Math.max(1e-12, e1 * e2));
            if (corr > best) best = corr;
        }
        return clamp(best);
    }

    private static double clamp(double x) {
        return Math.max(0.0, Math.min(1.0, x));
    }
}
