# BioP2: Advanced AI Signature Authentication System

BioP2 is a high-security, multi-factor biometric signature verification system. It combines traditional Dynamic Time Warping (DTW) with modern deep learning models (Transformers and Neural Networks) to provide a robust, offline-first authentication solution.

![License](https://img.shields.io/badge/license-MIT-blue)
![Tech](https://img.shields.io/badge/stack-React%20%7C%20TF.js%20%7C%20HuggingFace-orange)
![Security](https://img.shields.io/badge/security-Institutional%20Grade-brightgreen)

## 🌟 Features

- **Triple-Model Verification**:
    - **Model 1 (Visual)**: Uses HuggingFace's MobileViT to extract 640-dim visual embeddings.
    - **Model 2 (Behavioral)**: A 3-layer TensorFlow.js neural network trained on motor dynamics.
    - **Model 3 (Structural)**: Enhanced DTW engine for shape and timing alignment.
- **Smart Fusion**: 40/30/30 weighted decision scoring for maximum accuracy.
- **Advanced Anti-Spoofing**:
    - **Liveness Detection**: Analyzes velocity and acceleration variance.
    - **Replay Protection**: Timing fingerprinting to detect identical "copy-paste" signatures.
- **Offline Capability**: Service worker caches AI models (22MB) for full offline verification.
- **Privacy-First**: All biometric data and AI models are stored and executed locally on the device (IndexedDB).

## 🛠 Tech Stack

- **Frontend**: React 19, Vite, Vanilla CSS.
- **AI/ML**: 
    - `@xenova/transformers` (HuggingFace Transformers.js)
    - `@tensorflow/tfjs` (TensorFlow.js)
- **Storage**: IndexedDB (via custom wrapper with AES-GCM encryption).
- **Offline**: Service Workers.

## 🚀 Installation

```bash
# Clone the repository
git clone https://github.com/Krishna27-art/Signature_authentication_system.git

# Enter the directory
cd Signature_authentication_system

# Install dependencies
npm install

# Run the development server
npm run dev
```

## 📖 Usage

1. **Enrollment**: 
   - Draw your signature 5 times.
   - The system will compute a structural template and train your personal behavioral neural network.
   - AI models will initialize and cache for offline use.
2. **Verification**: 
   - Draw your signature on the canvas.
   - The system analyzes visual shape, motor patterns, and structural timing.
   - A fused similarity score (0-100) determines if identity is verified.
3. **Adaptive Learning**: 
   - The system updates your profile every 5 successful logins to account for natural signature drift.

## 🏗 Project Structure

```txt
src/
├── components/          # React components (SignatureCanvas, etc.)
├── lib/                 # Core Biometric Engines
│   ├── biometrics.js    # Main orchestration logic
│   ├── image_model.js   # Transformers.js visual analysis
│   ├── behavioral_model.js # TF.js behavioral neural net
│   └── score_fusion.js  # 40/30/30 fusion algorithm
public/
└── service_worker.js    # Offline model caching
```

## 🔒 Security Policy

This system implements an exponential lockout policy. After 3 failed attempts, the system locks verification for an increasing duration, protecting against brute-force attacks.

## 🤝 Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License.

## 👤 Author

**Krishna** - [GitHub](https://github.com/Krishna27-art)
