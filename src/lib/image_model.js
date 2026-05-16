import { pipeline, env } from '@xenova/transformers';

// Configure Transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;
env.remoteHost = 'https://huggingface.co';
env.remotePathTemplate = '{model}/resolve/{revision}/';

let extractor = null;

/**
 * Loads a MUCH lighter model for faster browser inference.
 * MobileNetV3 is ~3-5x faster than MobileViT.
 */
export async function loadImageModel() {
    if (!extractor) {
        console.log("📥 Loading Lightweight Image Model (mobilenetv3)...");
        try {
            extractor = await pipeline(
                'image-feature-extraction',
                'Xenova/mobilenetv3-small-100'
            );
            console.log("✅ Image model loaded and ready.");
        } catch (err) {
            console.error("❌ Model load failed:", err);
            throw new Error("Failed to load AI Image Model. Check internet connection.", { cause: err });
        }
    }
    return extractor;
}

/**
 * L2 Normalization for embeddings
 */
function l2Normalize(v) {
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return mag > 0 ? v.map(x => x / mag) : v;
}

/**
 * Extract image features and truncate to 128 dimensions for speed.
 */
export async function getSignatureEmbedding(canvas) {
    if (!canvas) return null;
    
    const model = await loadImageModel();
    
    // Convert canvas to image data
    const offscreen = document.createElement('canvas');
    offscreen.width = 224;
    offscreen.height = 224;
    const octx = offscreen.getContext('2d');
    octx.fillStyle = 'white';
    octx.fillRect(0, 0, 224, 224);
    octx.drawImage(canvas, 0, 0, 224, 224);

    // Get embedding
    const output = await model(offscreen.toDataURL('image/jpeg'));
    
    // Truncate to 128 dimensions and L2 normalize
    let emb = Array.from(output.data).slice(0, 128);
    return l2Normalize(emb);
}

export function cosineSimilarity(v1, v2) {
    if (!v1 || !v2) return 0.5;
    let dot = 0;
    for (let i = 0; i < v1.length; i++) dot += v1[i] * v2[i];
    return (dot + 1) / 2; // Normalize to 0-1
}
