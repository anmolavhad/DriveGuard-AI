# DriveGuard AI 🛡️🚗

DriveGuard AI is an intelligent driver safety and fatigue detection system combining a high-performance computer vision backend with a modern mobile companion application built using Expo & React Native.

---

## 📁 Project Structure

```
DriveGuard-APP/
├── backend/                  # AI / Computer Vision Backend
│   ├── fatigue_detector.py   # MediaPipe face mesh & fatigue detection pipeline
│   └── face_landmarker.task  # MediaPipe face landmarker model
├── DriveGuardMobile/         # Cross-platform Mobile Application (Expo / React Native)
│   ├── App.js                # App entry & navigation
│   ├── screens/              # Dashboard, Camera Monitor, Trip History, Settings
│   ├── components/           # Reusable UI components
│   ├── context/              # App state management
│   ├── hooks/                # Custom React hooks
│   └── package.json          # Mobile dependencies (Expo SDK 58, React Native 0.88)
└── README.md
```

---

## 🚀 Getting Started

### 1. Backend Setup (Computer Vision Pipeline)

```bash
cd backend
pip install opencv-python mediapipe numpy
python fatigue_detector.py
```

### 2. Mobile App Setup (Expo & React Native)

```bash
cd DriveGuardMobile
npm install
npx expo start
```

Use the Expo Go app on iOS or Android, or press `a` for Android Emulator / `i` for iOS Simulator.

---

## 🛠️ Features

- **Real-Time Fatigue Detection**: Eye Aspect Ratio (EAR), blink duration, and yawn tracking via MediaPipe Face Landmark detection.
- **Audio & Visual Alerts**: Immediate warnings when fatigue or drowsiness patterns are detected.
- **Modern UI**: Dark-themed, driver-focused interface with live telemetry and session stats.
- **Cross-Platform**: Built with Expo (SDK 58) for seamless iOS and Android deployment.

---

## 📄 License

This project is licensed under the MIT License.
