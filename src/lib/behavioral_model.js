import * as tf from '@tensorflow/tfjs';

let cachedBehaviorModel = null;

/**
 * Global model caching to avoid slow IndexedDB loads on every verification.
 */
export async function loadModel() {
    if (cachedBehaviorModel) return cachedBehaviorModel;
    try {
        cachedBehaviorModel = await tf.loadLayersModel('indexeddb://behavioral-model');
        return cachedBehaviorModel;
    } catch {
        return null;
    }
}

export async function saveModel(model) {
    cachedBehaviorModel = model;
    await model.save('indexeddb://behavioral-model');
}

/**
 * Advanced architecture: 32 -> 16 -> 1 with Dropout for better generalization.
 */
function createModel() {
    const model = tf.sequential();
    model.add(tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [8]
    }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({
        units: 16,
        activation: 'relu'
    }));
    model.add(tf.layers.dropout({ rate: 0.1 }));
    model.add(tf.layers.dense({
        units: 1,
        activation: 'sigmoid'
    }));

    model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
    });
    return model;
}

/**
 * Extract behavioral features from RAW points to preserve timing/aspect ratio.
 */
export function extractBehavioralFeatures(points, strokes) {
    if (!points || points.length < 2) return new Array(8).fill(0);

    const dur = points[points.length - 1].t - points[0].t;
    const dist = points.reduce((s, p, i) => i === 0 ? 0 : s + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y), 0);
    const avgVel = dist / Math.max(dur, 1);
    
    const pressures = points.map(p => p.p || 0.5);
    const avgPress = pressures.reduce((a, b) => a + b, 0) / points.length;
    
    const vels = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y) / Math.max(p.t - points[i].t, 1));
    const maxVel = Math.max(...vels, 0);
    
    // Jerk (derivative of acceleration)
    const accels = vels.slice(1).map((v, i) => (v - vels[i]) / 1);
    const avgJerk = accels.slice(1).reduce((s, a, i) => s + Math.abs(a - accels[i]), 0) / Math.max(accels.length, 1);

    const strokeCount = strokes ? strokes.length : 1;
    const liftRatio = (strokes && strokes.length > 1) ? (strokes.length / (points.length / 10)) : 0;

    return [
        avgVel,      // 0: Global speed
        avgPress,    // 1: Average pressure
        maxVel,      // 2: Peak velocity
        avgJerk,     // 3: Fluidity/Jerk
        dur / 1000,  // 4: Total duration
        dist / 1000, // 5: Path length
        strokeCount, // 6: Motor complexity
        liftRatio    // 7: Pen lift frequency
    ];
}

/**
 * Human-like perturbations for better negative sample training.
 */
function generateNegativeSample(base) {
    return [
        base[0] * (0.7 + Math.random() * 0.6),
        base[1] + (Math.random() - 0.5) * 0.2,
        base[2] + (Math.random() - 0.5) * 0.25,
        base[3] * (0.8 + Math.random() * 0.4),
        base[4] + (Math.random() - 0.5) * 0.2,
        base[5] + (Math.random() - 0.5) * 0.2,
        base[6] * (0.8 + Math.random() * 0.5),
        base[7]
    ];
}

export async function trainBehavioralModel(enrollmentFeatures) {
    const model = createModel();
    
    // Prepare training data
    const xPos = enrollmentFeatures;
    const xNeg = [];
    for (let i = 0; i < xPos.length * 5; i++) {
        const base = xPos[i % xPos.length];
        xNeg.push(generateNegativeSample(base));
    }

    const yPos = new Array(xPos.length).fill(1);
    const yNeg = new Array(xNeg.length).fill(0);

    const xTrain = tf.tensor2d([...xPos, ...xNeg]);
    const yTrain = tf.tensor2d([...yPos, ...yNeg], [yPos.length + yNeg.length, 1]);

    console.log("🧠 Training Behavioral Model with async frames...");
    await model.fit(xTrain, yTrain, {
        epochs: 30,
        batchSize: 8,
        shuffle: true,
        verbose: 0,
        callbacks: {
            onEpochEnd: async () => {
                await tf.nextFrame(); // Prevent UI freeze
            }
        }
    });

    xTrain.dispose();
    yTrain.dispose();
    return model;
}

/**
 * Predict using tf.tidy() to prevent memory leaks.
 */
export async function predictBehavior(model, features) {
    if (!model) return 0.5;
    return tf.tidy(() => {
        const input = tf.tensor2d([features]);
        const prediction = model.predict(input);
        return prediction.dataSync()[0];
    });
}
