/**
 * Standardize features using stored mean and std.
 */
export function standardize(features, stats) {
    if (!stats) return features;
    return features.map((v, i) => (v - stats.mean[i]) / (stats.std[i] || 1));
}

/**
 * Optimized DTW Distance to Similarity conversion.
 * Uses a more passing-friendly scale.
 */
export function dtwDistanceToSimilarity(distance, threshold = 0.15) {
    const baseThreshold = Math.max(threshold, 0.01);
    const similarity = 100 * Math.exp(-(distance / (baseThreshold * 2.4)));
    return Math.max(0, Math.min(100, similarity));
}

function clampUnitScore(score) {
    if (score === null || score === undefined || Number.isNaN(score)) return null;
    return Math.max(0, Math.min(1, score));
}

function weightedAverage(entries) {
    const active = entries.filter((entry) => entry.score !== null);
    if (active.length === 0) return 0;

    const totalWeight = active.reduce((sum, entry) => sum + entry.weight, 0);
    const weightedSum = active.reduce((sum, entry) => sum + (entry.score * entry.weight), 0);
    return weightedSum / totalWeight;
}

function confidenceAdjustedScore(score) {
    const normalized = clampUnitScore(score);
    if (normalized === null) return null;

    // Treat uncertain neural outputs around 0.5 as weak evidence rather than a hard penalty.
    if (normalized >= 0.45 && normalized <= 0.55) {
        return 0.5;
    }
    return normalized;
}

export function summarizeNearestDistances(distances, take = 3) {
    const clean = distances
        .filter((distance) => Number.isFinite(distance))
        .sort((a, b) => a - b)
        .slice(0, take);

    if (clean.length === 0) return Infinity;
    return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export function scoreFromDistanceBand(bestDistance, referenceThreshold) {
    const ratio = bestDistance / Math.max(referenceThreshold, 0.01);
    if (ratio <= 0.75) return 1;
    if (ratio >= 1.5) return 0;
    return 1 - ((ratio - 0.75) / 0.75);
}

/**
 * Fuse available signals without penalizing missing models.
 * DTW remains the primary biometric signal, while image and behavior refine it.
 */
export function fuseScores(dtwSim, imageSim, behaviorSim) {
    const dtwScore = Math.max(0, Math.min(100, dtwSim)) / 100;
    const imageScore = confidenceAdjustedScore(imageSim);
    const behavioralScore = confidenceAdjustedScore(behaviorSim);

    const fused = weightedAverage([
        { score: dtwScore, weight: 0.6 },
        { score: imageScore, weight: imageScore === null ? 0 : 0.25 },
        { score: behavioralScore, weight: behavioralScore === null ? 0 : 0.15 },
    ]);

    const dtwFloor = Math.max(0.55, dtwScore * 0.92);
    return Math.max(dtwFloor, fused) * 100;
}

/**
 * Advanced DTW Weighting for point distance.
 * Increases importance of spatial coordinates and pressure.
 */
export function ptDist(a, b) {
    const dx = (a.x - b.x) ** 2;
    const dy = (a.y - b.y) ** 2;
    const dv = ((a.vel || 0) - (b.vel || 0)) ** 2;
    const dd = Math.atan2(Math.sin((a.dir || 0) - (b.dir || 0)), Math.cos((a.dir || 0) - (b.dir || 0))) ** 2;
    const da = ((a.acc || 0) - (b.acc || 0)) ** 2;
    const dc = ((a.curv || 0) - (b.curv || 0)) ** 2;
    const dp = ((a.p || 0.5) - (b.p || 0.5)) ** 2;

    return Math.sqrt(
        dx * 1.2 +
        dy * 1.2 +
        dv * 0.35 +
        dd * 0.30 +
        da * 0.12 +
        dc * 0.10 +
        dp * 0.25
    );
}

/**
 * Dynamic Thresholding based on user performance history.
 */
export function getDynamicThreshold(avgScore) {
    if (avgScore === null) return 72;
    return Math.max(68, Math.min(82, avgScore - 10));
}
