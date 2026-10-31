# DriveGuard AI 🛡️

[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Face%20Landmarker-007ACC?style=flat-square&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![React Native](https://img.shields.io/badge/React%20Native-Expo%20SDK%2058-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactnative.dev)
[![React](https://img.shields.io/badge/React-19.x%20Vite-61DAFB?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![MySQL](https://img.shields.io/badge/MySQL-8.0%20ACID-4479A1?style=flat-square&logo=mysql&logoColor=white)](https://www.mysql.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> **Real-Time Driver Fatigue Monitoring, Microsleep Interception & Fleet Dispatch Ecosystem**

DriveGuard AI is an end-to-end commercial fleet safety ecosystem that detects driver fatigue, micro-sleep events, and distraction in real time using computer vision at the edge. The platform combines a low-latency Python/FastAPI computer vision pipeline, a high-contrast dark automotive mobile cockpit app for drivers, an enterprise operations web console for dispatchers, and a persistent MySQL 8.0 database.

---

## 📌 Architecture Overview

```text
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│     Android Driver Mobile       │       │    Fleet Web Dashboard (Vite)   │
│   (Standalone .APK / Expo 58)   │       │     (React 19 / Tailwind CSS)   │
└────────────────┬────────────────┘       └────────────────┬────────────────┘
                 │                                         │
        WSS (Secure WebSocket)                     HTTPS REST / WSS
                 │                                         │
                 ▼                                         ▼
         ┌─────────────────────────────────────────────────────────┐
         │              Unified Edge Backend                       │
         │      FastAPI + MediaPipe Face Mesh AI Engine            │
         │      (468 Landmark Geometry, Dynamic Calibration)       │
         └───────────────────────────┬─────────────────────────────┘
                                     │
                             PyMySQL Pool (ACID)
                                     │
                                     ▼
         ┌─────────────────────────────────────────────────────────┐
         │             MySQL 8.0 Relational Database               │
         │   (Operators, Drivers, Linked Fleet Codes, Audit Logs)  │
         └─────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Features

### 🧠 Edge Computer Vision Pipeline
- **Adaptive Biometric Calibration**: During the first 5 seconds of every driving session, DriveGuard acquires the driver's natural open-eye Eye Aspect Ratio (EAR) baseline and sets individual sleep thresholds at 70% of baseline (no rigid global constants).
- **Strict 3-Tier State Machine**: Transitions deterministically between `AWAKE`, `WARNING` (0.5s–1.4s eye closure), and `CRITICAL` (≥ 1.5s prolonged closure or frequent micro-sleeps).
- **Sub-120ms Telemetry**: Streams facial landmark reticles, EAR values, mouth aspect ratio (MAR), and vigilance states over bi-directional WebSockets at ~8–10 FPS.
- **Privacy by Design**: Frames are evaluated ephemerally in RAM and immediately discarded. Zero raw video streams are retained or uploaded to cloud storage.

### 📱 Driver Mobile App (`DriveGuardMobile`)
- **Automotive Cockpit Design**: High-contrast pure black (`#000000`) theme engineered for day and night driving glare reduction.
- **Dual-Engine Emergency Alarm**: Built with `expo-av` and `expo-audio` fallback, playing high-decibel offline siren audio through device speakers even in silent mode.
- **Continuous Tactile Haptics**: Native vibration engine (`[0, 500, 200, 500]` ms loops) to awaken drivers during micro-sleeps.
- **Decoupled Render Architecture**: SVG face meshes and telemetry overlays update independently from the camera viewfinder to prevent frame drops or UI flickering.
- **Permanent Driver Codes**: Unique 6-digit alpha-numeric fleet identification codes (e.g., `DG8042`) for 1-tap fleet dispatcher pairing.

### 🖥️ Dispatch Operations Console (`DriveGuard-WEB`)
- **Live Fleet Monitor**: Real-time multi-driver vigilance tracking with live WebSocket status dots, EAR gauges, and alert feeds.
- **Per-Operator Security & Scoping**: Strict operator isolation ensuring dispatchers only view drivers explicitly linked to their command console.
- **Audit Incident Ledger**: Comprehensive incident audit logs recording start timestamps, duration, peak state, and trigger metrics for compliance.
- **Enterprise Auth Portal**: Split-screen dual-column login/registration with semantic accessible inputs, password toggles, and 1-click evaluation demo auto-fill.

### 🗄️ Relational Database (`MySQL 8.0`)
- **Thread-Safe PyMySQL Adapter**: Automatic connection pooling, reconnection handling, and schema self-healing on startup.
- **Normalized Relational Schema**: Dedicated relational tables for `operators`, `drivers`, `operator_driver_links`, `trips`, and `audit_logs`.

---

## 📂 Repository Structure

```text
DriveGuard-AI/
├── backend/
│   ├── fatigue_detector.py      # Core FastAPI app, WebSocket hub, MediaPipe vision engine
│   ├── mysql_db.py              # Thread-safe MySQL 8.0 adapter & automated table initializer
│   ├── face_landmarker.task     # Pre-trained MediaPipe face landmark model weights
│   ├── simulator.py             # Telemetry generator for load testing & headless demos
│   ├── database.json            # Local fallback snapshot database
│   ├── .env.example             # Database configuration template
│   └── requirements.txt         # Python dependencies
│
├── DriveGuardMobile/            # React Native Driver Application (Expo SDK 58)
│   ├── App.js                   # Navigation root & global emergency modal provider
│   ├── app.json                 # Expo application manifest, permissions, and plugins
│   ├── eas.json                 # Standalone APK build profiles
│   ├── assets/                  # Icons, splash screens, and offline alarm siren audio
│   ├── components/
│   │   ├── CameraScreen.js      # Stable camera feed & decoupled SVG face mesh overlay
│   │   ├── SleepAlarmModal.js   # Dual-engine siren & tactile emergency alarm popup
│   │   └── IPConfigModal.js     # Dispatch server IP config overlay
│   └── screens/
│       ├── HomeScreen.js        # Vehicle ID badge, start CTA, pre-trip safety checklist
│       ├── AnalyticsScreen.js   # Session history aggregates & vigilance distribution
│       ├── HistoryScreen.js     # Chronological driving session records
│       ├── SettingsScreen.js    # Sound volume, vibration toggle, test siren action
│       └── AuthScreen.js        # Driver authentication & permanent code issuance
│
└── DriveGuard-WEB/
    └── driveguard-dashboard/    # Fleet Dispatcher Web Dashboard (React 19 + Vite)
        ├── src/
        │   ├── App.jsx          # Operations console, live telemetry, and audit ledger
        │   ├── App.css          # Tabular numbers and enterprise theme styles
        │   └── index.css        # Tailwind directives and custom scrollbars
        ├── tailwind.config.js   # Color schemes, typography, and layout rules
        └── vite.config.js       # Vite bundler configuration
```

---

## 🛠️ Getting Started

### Prerequisites
- **Python**: 3.10 or higher
- **Node.js**: v18.0.0 or higher (v20+ recommended) & npm
- **MySQL Server**: 8.0 running locally or on a cloud host
- **Expo CLI**: `npm install -g expo-cli` (or run via `npx expo`)

---

### Step 1: Database Setup (MySQL)

1. Verify that your MySQL service is running on port `3306`:
   ```bash
   mysql -u root -p
   ```
2. Navigate to `backend/` and configure your credentials:
   ```bash
   cd backend
   cp .env.example .env
   ```
3. Edit `.env` with your MySQL connection details:
   ```env
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=YourPasswordHere
   MYSQL_DB=driveguard_db
   ```
   *(The database and all required tables will be created automatically on initial backend startup).*

---

### Step 2: Backend & AI Engine Setup

1. Install Python dependencies:
   ```bash
   cd backend
   pip install fastapi uvicorn websockets opencv-python mediapipe pymysql python-dotenv numpy
   ```
2. Start the FastAPI server:
   ```bash
   uvicorn fatigue_detector:app --host 0.0.0.0 --port 8000 --reload
   ```
3. Verify server health:
   - REST API: [http://localhost:8000/api/health](http://localhost:8000/api/health)
   - Swagger Documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
   - WebSocket Telemetry Endpoint: `ws://localhost:8000/ws/telemetry`

---

### Step 3: Web Dashboard Setup

1. Open a new terminal and navigate to the dashboard directory:
   ```bash
   cd DriveGuard-WEB/driveguard-dashboard
   npm install
   ```
2. Start the Vite development server:
   ```bash
   npm run dev
   ```
3. Open your browser at [http://localhost:5173](http://localhost:5173).
   - Use the **"Quick Demo: Load Dispatcher Credentials"** button on the login screen to sign in instantly.

---

### Step 4: Mobile Driver App Setup

1. Open a third terminal:
   ```bash
   cd DriveGuardMobile
   npm install
   ```
2. Start the Expo development server:
   ```bash
   npx expo start
   ```
3. **Run on Device**:
   - **Android**: Press `a` or scan the QR code using the **Expo Go** app.
   - **Web Browser**: Press `w` to test in Chrome/Edge.
4. **Configure Backend IP**:
   - On the Mobile Home screen, tap the **IP / Server** badge and enter your computer's local LAN IP (e.g. `192.168.1.15:8000`) so the physical phone can stream camera frames to the backend.

---

## 📡 API & Telemetry Reference

### Key REST Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Backend status, active driver count, and MySQL connectivity |
| `POST` | `/api/operators/register` | Register a new fleet dispatcher account |
| `POST` | `/api/operators/login` | Authenticate operator credentials |
| `GET` | `/api/operators/{op_id}/drivers` | Retrieve all drivers linked to a specific operator |
| `POST` | `/api/operators/{op_id}/drivers` | Link a driver to an operator via 6-digit Driver Code |
| `DELETE`| `/api/operators/{op_id}/drivers/{code}` | Unlink a driver from an operator console |
| `POST` | `/api/drivers/auth` | Driver sign up / sign in with vehicle assignment |
| `GET` | `/api/drivers/{driver_code}` | Query driver details by 6-digit code |
| `POST` | `/api/trips` | Submit completed trip telemetry aggregate |
| `GET` | `/api/trips` | Retrieve past trip records for analytics |

### WebSocket Frame Schema (`/ws/telemetry`)

**Client to Server (Image Frame)**:
```json
{
  "image": "<base64_encoded_jpeg>",
  "driver_code": "DG8042",
  "driver_id": "Alex Rivera"
}
```

**Server to Client (Live Telemetry Broadcast)**:
```json
{
  "state": "AWAKE",
  "status": "ATTENTIVE",
  "ear": 0.312,
  "mar": 0.084,
  "alert": false,
  "alarm": false,
  "calibrated": true,
  "closure_duration": 0.0,
  "landmarks": {
    "left_eye": [{"x": 0.42, "y": 0.38}],
    "right_eye": [{"x": 0.58, "y": 0.38}],
    "jawline": [{"x": 0.50, "y": 0.65}]
  }
}
```

---

## 📦 Building a Standalone Android APK

To generate an installable `.apk` file for Android devices without using Expo Go:

1. Install the EAS Command Line Interface:
   ```bash
   npm install -g eas-cli
   ```
2. Log in to your Expo account:
   ```bash
   eas login
   ```
3. Run the standalone preview APK build:
   ```bash
   cd DriveGuardMobile
   eas build -p android --profile preview
   ```
4. Once compilation finishes, EAS CLI will provide a direct download URL and QR code to download and install the standalone `.apk` on your phone.

---

## 🛡️ License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
