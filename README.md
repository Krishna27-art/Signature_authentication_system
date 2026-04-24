# signatre authentication system: Advanced Biometric Signature Authentication

BioSign is a research-grade, client-side signature authentication system. It uses behavioral biometrics and dynamic time warping (DTW) to verify identity based not just on *what* you sign, but *how* you sign it.

## 🚀 Key Features

### 1. Behavioral Biometric Engine
The system analyzes multiple dimensions of the signature:
- **Spatial Path (x, y)**: The actual shape of the signature.
- **Velocity & Acceleration**: The speed at which different parts are signed.
- **Curvature**: The angular velocity and loops within the strokes.
- **Pressure Simulation**: Approximated through speed and deceleration patterns.

### 2. Multi-Layered Security
- **Dynamic Time Warping (DTW)**: Matches the sequence of points even if the signature is slightly faster, slower, or shifted.
- **Liveness Detection**: Detects "robotic" or "traced" inputs by analyzing the coefficient of variation in speed. Humans have natural, chaotic speed variations that forgers struggle to replicate.
- **Replay Detection**: Generates a timing fingerprint for every attempt. If two attempts are identical (statistical outliers), it flags them as a recorded replay attack.
- **Adaptive Thresholding**: The system computes a personalized security threshold based on your initial 3 enrollment samples.

### 3. Online Learning Engine
BioSign is "self-improving." Every time you successfully log in:
- It records your natural variation.
- Every 5 logins, it recomputes your threshold to better match your current signature style.
- Every 15 logins, it upgrades your master template to account for "model drift" (natural changes in how you sign over time).

## 🛠 How It Works

1.  **Registration**: You provide 3 samples to establish a baseline.
2.  **Normalization**: The system removes jitter, resamples the path to 64 points, scales it to a unit box, and centers it on the origin.
3.  **Verification**: When you sign to log in, the system compares your new signature against the master template and all 3 enrollment samples.
4.  **Scoring**: A final score is generated (80% Shape/Dynamics + 20% Global Rhythm). If the score is below your personalized threshold, access is granted.

## 📂 Project Structure

- `index.html`: The gateway for enrollment and verification.
- `app.html`: The secure dashboard (Welcome Board) accessible only after verification.
- `index.js`: The core biometric engine containing all signal processing and matching logic.
- `style.css`: Premium UI design system using Glassmorphism.
- `signature_data.json`: (Optional) A template for exported biometric data.

## 🔒 A Note on Storage
For security and privacy, all biometric data is stored locally in your browser's **LocalStorage**. To save your data to a physical file in this folder, use the **"Export Biometric Data"** button on the dashboard.
