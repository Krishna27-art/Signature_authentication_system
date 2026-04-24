# Signature authentication system (Deep Biometric Edition)

This system is a research-grade biometric authentication platform that combines classical signal processing with deep neural architectures. It is designed to capture the unique "neuromotor firing pattern" of the human nervous system.

## 🚀 The Multi-Layer Neural Engine

The system implements a sophisticated 7-layer architecture entirely in the browser using **TensorFlow.js**.

### 🧪 Layer 2: Siamese Identity Embedding
- **CNN Architecture**: A 1D Convolutional Neural Network extracts deep behavioral features from the signature trajectory.
- **Contrastive Learning**: During enrollment, the system trains a distance metric that pulls genuine samples together and pushes forgeries away.
- **Real Training**: Implemented with a real gradient-descent optimizer (`tf.train.adam`) running in the background.

### 🌐 Layer 3: VAE Latent Identity Manifold
- **Manifold Learning**: A Variational Autoencoder (VAE) learns a personal latent space for your signature.
- **Reconstruction Loss**: The model is trained to minimize KL-Divergence and Reconstruction error, ensuring it only recognizes signatures that fit your unique "identity manifold."
- **Visual Demo**: The dashboard provides a 2D plot of your latent cluster.

### 🧬 Layer 4: Neuromotor Inversion
- **Feature Decomposition**: High-fidelity analysis of velocity, direction, curvature, and approximated pressure.
- **Biometric Depth**: By modeling the acceleration and jitter (Layer 5), the system captures physiological traits that are nearly impossible to forge manually.

### ⚔️ Layer 5: Adversarial Self-Hardening (GAN)
- **Generative Hardening**: An internal **GAN Generator** (The Forger) tries to synthesize signatures that fool the authenticator.
- **Adversarial Training**: The system runs a background "arms race" during enrollment, hardening the Siamese network against synthetic attacks.

### 🛡️ Layer 6: Bayesian Trust Fusion & Commitment
- **Evidence Accumulation**: A Bayesian model fuses shape (DTW), rhythm, tremor, and neural scores into a single "Trust Index."
- **Privacy**: Uses a cryptographic commitment (SHA-256) of the neural template to ensure biometric privacy on the device.

## 🛠 Project Structure

- `index.html`: Neural gateway with TensorFlow.js integration.
- `index.js`: The core engine containing the Siamese, VAE, and GAN training pipelines.
- `app.html`: Secure dashboard with real-time **Latent Space Visualization**.
- `style.css`: Premium dark-mode interface with glassmorphism.

---
*"Identity is not what you draw — it is the unique firing pattern of your nervous system."*
