# Signature Authentication System

A production-grade biometric authentication platform that captures and verifies the unique behavioral patterns of a human signature. This version utilizes a **Node.js backend** for persistent, file-based storage.

---
*"Identity is not what you draw — it is the unique firing pattern of your nervous system."*

## 🚀 Core Features

### 📂 Server-Backed Persistence
Unlike standard browser apps, this system uses a local Node.js server to save your biometric data to `signature_data.json`. This ensures your identity profile is never lost when you clear your browser cache.

### 🧠 Advanced Matching Engine
- **Dynamic Time Warping (DTW)**: A sophisticated signal-processing algorithm that compares signatures regardless of slight variations in speed or timing.
- **Multi-Feature Analysis**: The system analyzes 6 distinct dimensions:
    - **Spatial**: X/Y coordinates and trajectory.
    - **Temporal**: Velocity and rhythm.
    - **Physiological**: Curvature and stroke-approximated pressure.

### 🛡️ Anti-Spoofing Protocol
- **Liveness Check**: Analyzes the "Coefficient of Variation" in signing speed to detect static traces or slow-drawn forgeries.
- **Replay Detection**: Generates a fuzzy timing fingerprint to block session-playback attacks.

### 📈 Online Learning System
- **Adaptive Threshold**: The system learns your natural variation over time and adjusts the security threshold automatically every 5 logins.
- **Template Drift**: Your biometric profile "ages" and updates as your signature gradually changes over months or years.

---

## 🛠️ Project Structure

- `server.js`: Node.js Express backend for file-system persistence.
- `index.js`: The core biometric engine (Normalization, DTW, and Security Gates).
- `index.html`: The interactive signing gateway.
- `app.html`: Secure user dashboard.
- `signature_data.json`: The local "vault" where your biometric data is stored.

---

## 🏁 Quick Start

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Server**:
   ```bash
   node server.js
   ```

3. **Access the App**:
   Open your browser to `http://localhost:3000`

---

## 📊 System Architecture

```text
            ┌──────────────┐
            │   USER INPUT │
            └──────┬───────┘
                   ↓
        ┌────────────────────┐
        │  RAW DATA CAPTURE  │
        └──────┬─────────────┘
               ↓
        ┌────────────────────┐
        │ PREPROCESSING      │
        │ - Remove Noise     │
        │ - Remove Dot       │
        └──────┬─────────────┘
               ↓
        ┌────────────────────┐
        │ NORMALIZATION      │
        │ - Resample         │
        │ - Scale            │
        │ - Center           │
        └──────┬─────────────┘
               ↓
        ┌────────────────────┐
        │ FEATURE EXTRACTION │
        │ - Speed            │
        │ - Direction        │
        │ - Curvature        │
        │ - Pressure         │
        └──────┬─────────────┘
               ↓
        ┌────────────────────┐
        │ SECURITY CHECK     │
        │ - Liveness         │
        │ - Replay detect    │
        └──────┬─────────────┘
               ↓
        ┌────────────────────┐
        │ MATCHING ENGINE    │
        │ - DTW Algorithm    │
        └──────┬─────────────┘
               ↓
        ┌────────────────────┐
        │ DECISION           │
        │ - Threshold check  │
        └──────┬─────────────┘
               ↓
        ┌────────────────────┐
        │ RESULT             │
        │ - Accept / Reject  │
        └──────┬─────────────┘
               ↓
        ┌────────────────────┐
        │ LEARNING SYSTEM    │
        │ - Update model     │
        └────────────────────┘
```

## 🔐 Data Format

The system stores its biometric vault in a structured JSON format:
```json
{
  "sig_template": [...],
  "sig_threshold": 0.142,
  "sig_login_history": [...],
  "_savedAt": "2024-01-15T10:30:00.000Z"
}
```