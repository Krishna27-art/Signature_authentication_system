# BioP2 Signature Authentication System

BioP2 is a browser-based signature authentication project that combines visual, behavioral, and structural analysis to verify handwritten signatures. It is built with React and Vite, runs locally in the browser, and includes offline-friendly behavior, biometric enrollment, and automated test coverage.

![License](https://img.shields.io/badge/license-ISC-blue)
![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61dafb)
![AI](https://img.shields.io/badge/AI-TensorFlow.js%20%7C%20Transformers-orange)
![Testing](https://img.shields.io/badge/testing-Jest%20%7C%20Playwright-green)

## Overview

The system captures a user's signature through a canvas-based interface, stores enrollment samples locally, and evaluates future attempts using multiple verification signals. The project is designed as a practical prototype for biometric signature verification in secure, client-side environments.

## Key Features

- Multi-factor signature verification using visual, behavioral, and structural analysis
- Enrollment workflow with repeated sample capture for profile creation
- Canvas-based signing interface optimized for browser input events
- Offline-first behavior with cached assets and local biometric state
- Basic anti-spoofing and verification heuristics
- Automated unit and end-to-end testing support

## Tech Stack

- Frontend: React 19, Vite
- Machine learning: TensorFlow.js, Transformers.js
- Storage: IndexedDB and local browser storage
- Testing: Jest, Playwright
- Tooling: ESLint

## Project Structure

```text
src/
├── App.jsx                     # Main application flow
├── components/
│   └── SignatureCanvas.jsx     # Signature input component
├── lib/
│   ├── behavioral_model.js     # Behavioral feature model
│   ├── biometrics.js           # Biometric orchestration and storage
│   ├── image_model.js          # Visual signature analysis
│   └── score_fusion.js         # Decision fusion logic
tests/
├── unit.test.js                # Unit tests
├── e2e.spec.js                 # End-to-end tests
└── synthetic_gen.js            # Synthetic signature data generation
public/
└── service_worker.js           # Offline support
```

## Getting Started

### Prerequisites

- Node.js 18 or later recommended
- npm

### Installation

```bash
git clone https://github.com/Krishna27-art/Signature_authentication_system.git
cd Signature_authentication_system
npm install
```

### Run the Application

```bash
npm run dev
```

After the development server starts, open the local Vite URL shown in your terminal.

## Available Scripts

```bash
npm run dev         # Start development server
npm run build       # Create production build
npm run preview     # Preview production build locally
npm run lint        # Run ESLint
npm run test        # Run Jest unit tests
npm run test:e2e    # Run Playwright end-to-end tests
npm run test:e2e:ui # Open Playwright UI mode
npm run test:report # Open Playwright test report
```

## How It Works

### 1. Enrollment

The user provides multiple signature samples. These samples are used to create a baseline signature profile and initialize the verification state.

### 2. Verification

When a new signature is submitted, the system compares it against the enrolled profile using:

- Visual characteristics of the signature image
- Behavioral dynamics such as timing and stroke flow
- Structural similarity across the signature path

### 3. Decision Fusion

The individual signals are combined into a final confidence score that determines whether verification succeeds.

## Testing

This repository includes both unit and browser-based test coverage:

- `Jest` validates core logic and utility behavior
- `Playwright` verifies end-to-end flows
- `test_harness.html` provides a browser-based synthetic testing interface

## Security Notes

This project is a strong prototype for client-side biometric verification, but it should still be treated as an application under development rather than a production-hardened security product. If you plan to deploy it in a real environment, server-side security review, threat modeling, and formal biometric performance evaluation are recommended.

## Repository

- GitHub: https://github.com/Krishna27-art/Signature_authentication_system
- Issues: https://github.com/Krishna27-art/Signature_authentication_system/issues

## License

This project is licensed under the ISC License.
