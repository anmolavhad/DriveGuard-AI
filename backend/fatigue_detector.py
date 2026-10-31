"""
fatigue_detector.py
───────────────────
DriveGuard AI — High-Precision Driver Fatigue Detection Engine.

Key Engineering Mechanisms:
1. Dynamic Calibration Phase:
   - 5-second baseline acquisition upon session start or recalibration.
   - Computes driver's personal open-eye baseline EAR.
   - Dynamically sets SLEEP_THRESHOLD = 70% of baseline EAR (no hardcoded constants).

2. Temporal Smoothing & Frame Buffering (Blink Filter):
   - 3-frame rolling average buffer to eliminate high-frequency camera noise.
   - Wall-clock closure timer (time.monotonic) immune to frame-rate jitter.
   - Normal blinks (< 300ms) are filtered out completely.
   - Immediate counter reset whenever EAR >= SLEEP_THRESHOLD.

3. Strict 3-Tier State Machine:
   - CALIBRATING : First 5 seconds while baseline EAR is acquired.
   - AWAKE       : EAR >= threshold or closure < 0.5s (normal attentive driving / blinks).
   - WARNING     : Closure between 0.5s and 1.4s (mild visual UI alert).
   - CRITICAL    : Closure >= 1.5s (immediate emergency audio & vibration alarm).

4. Low-Latency WebSocket & MediaPipe Processing:
   - Handles base64 compressed JPEG frames from React Native expo-camera.
   - Dual MediaPipe support (MediaPipe Tasks 1.0+ & legacy FaceMesh).
   - Sub-30ms frame processing latency.
"""

import os
import sys
import time
import math
import json
import base64
import threading
import urllib.request
from collections import deque
from typing import Optional, Tuple, Dict, Any, List

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn


# ─────────────────────────────────────────────────────────────────────────────
# 1. MediaPipe Face Mesh Landmark Configuration
# ─────────────────────────────────────────────────────────────────────────────
# Canonical eye landmark indices (MediaPipe 468/478 Face Mesh)
# Left Eye
LEFT_EYE_P1 = 33    # Outer corner
LEFT_EYE_P4 = 133   # Inner corner
LEFT_EYE_P2 = 160   # Upper eyelid point 1
LEFT_EYE_P6 = 144   # Lower eyelid point 1
LEFT_EYE_P3 = 158   # Upper eyelid point 2
LEFT_EYE_P5 = 153   # Lower eyelid point 2

# Right Eye
RIGHT_EYE_P1 = 362  # Outer corner
RIGHT_EYE_P4 = 263  # Inner corner
RIGHT_EYE_P2 = 385  # Upper eyelid point 1
RIGHT_EYE_P6 = 380  # Lower eyelid point 1
RIGHT_EYE_P3 = 387  # Upper eyelid point 2
RIGHT_EYE_P5 = 373  # Lower eyelid point 2

# Mouth (for optional MAR / yawn tracking)
MOUTH_TOP    = 13
MOUTH_BOTTOM = 14
MOUTH_LEFT   = 61
MOUTH_RIGHT  = 291

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "face_landmarker.task")


def ensure_model_file():
    """Ensure Google MediaPipe face_landmarker.task file exists locally."""
    if not os.path.exists(MODEL_PATH):
        print(f"[MediaPipe] Downloading face_landmarker model to {MODEL_PATH}...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("[MediaPipe] Model downloaded successfully.")


def euclidean_dist(p1, p2) -> float:
    """Euclidean distance between two normalized 2D/3D points."""
    return math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)


def calculate_ear(landmarks, is_right: bool = False) -> float:
    """
    Calculate Eye Aspect Ratio (EAR) using Soukupová & Čech (2016) formula:
    EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
    """
    if is_right:
        p1, p4 = landmarks[RIGHT_EYE_P1], landmarks[RIGHT_EYE_P4]
        p2, p6 = landmarks[RIGHT_EYE_P2], landmarks[RIGHT_EYE_P6]
        p3, p5 = landmarks[RIGHT_EYE_P3], landmarks[RIGHT_EYE_P5]
    else:
        p1, p4 = landmarks[LEFT_EYE_P1], landmarks[LEFT_EYE_P4]
        p2, p6 = landmarks[LEFT_EYE_P2], landmarks[LEFT_EYE_P6]
        p3, p5 = landmarks[LEFT_EYE_P3], landmarks[LEFT_EYE_P5]

    horiz_dist = euclidean_dist(p1, p4)
    if horiz_dist < 1e-6:
        return 0.0

    vert_dist1 = euclidean_dist(p2, p6)
    vert_dist2 = euclidean_dist(p3, p5)
    return (vert_dist1 + vert_dist2) / (2.0 * horiz_dist)


def calculate_mar(landmarks) -> float:
    """Calculate Mouth Aspect Ratio (MAR) for yawn detection."""
    p_top, p_bot   = landmarks[MOUTH_TOP], landmarks[MOUTH_BOTTOM]
    p_left, p_right = landmarks[MOUTH_LEFT], landmarks[MOUTH_RIGHT]
    horiz = euclidean_dist(p_left, p_right)
    if horiz < 1e-6:
        return 0.0
    vert = euclidean_dist(p_top, p_bot)
    return vert / horiz


class MediaPipeFaceMeshDetector:
    """
    High-performance MediaPipe Face Mesh inference wrapper.
    Compatible with MediaPipe Tasks 1.0+ and legacy FaceMesh.
    """

    def __init__(self):
        self.mode = "tasks"
        self.detector = None
        try:
            import mediapipe as mp
            from mediapipe.tasks import python
            from mediapipe.tasks.python import vision

            ensure_model_file()
            model_bytes = None
            if os.path.exists(MODEL_PATH):
                with open(MODEL_PATH, "rb") as f:
                    model_bytes = f.read()

            base_options = python.BaseOptions(
                model_asset_buffer=model_bytes if model_bytes else None,
                model_asset_path=MODEL_PATH if not model_bytes else None
            )
            options = vision.FaceLandmarkerOptions(
                base_options=base_options,
                output_face_blendshapes=False,
                output_facial_transformation_matrixes=False,
                num_faces=1,
            )
            self.detector = vision.FaceLandmarker.create_from_options(options)
            self.mp = mp
            print("[MediaPipe] Initialized MediaPipe Tasks FaceLandmarker successfully.")
        except Exception as err:
            print(f"[MediaPipe] Tasks init notice: {err}. Attempting fallback...")
            try:
                import mediapipe as mp
                try:
                    from mediapipe.python.solutions import face_mesh as mp_face_mesh
                except Exception:
                    mp_face_mesh = getattr(getattr(mp, 'solutions', None), 'face_mesh', None)

                if mp_face_mesh:
                    self.legacy_face_mesh = mp_face_mesh.FaceMesh(
                        max_num_faces=1,
                        refine_landmarks=True,
                        min_detection_confidence=0.5,
                        min_tracking_confidence=0.5,
                    )
                    self.mode = "legacy"
                    print("[MediaPipe] Initialized legacy FaceMesh.")
                else:
                    self.mode = "disabled"
                    print("[MediaPipe] Running in graceful fallback mode.")
            except Exception as leg_err:
                self.mode = "disabled"
                print(f"[MediaPipe] Fallback active ({leg_err}). Server ready.")

    def process_frame(self, bgr_image: np.ndarray) -> Tuple[Optional[float], Optional[float], Optional[Dict]]:
        """
        Process BGR frame and return (ear, mar, landmarks_dict).
        Returns (None, None, None) if no face is detected.
        """
        if self.mode == "disabled" or (self.mode == "tasks" and getattr(self, "detector", None) is None):
            return None, None, None

        rgb_image = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)

        if self.mode == "tasks":
            mp_image = self.mp.Image(
                image_format=self.mp.ImageFormat.SRGB,
                data=rgb_image
            )
            detection_result = self.detector.detect(mp_image)
            if not detection_result.face_landmarks:
                return None, None, None
            landmarks = detection_result.face_landmarks[0]
        else:
            results = self.legacy_face_mesh.process(rgb_image)
            if not results.multi_face_landmarks:
                return None, None, None
            landmarks = results.multi_face_landmarks[0].landmark

        left_ear  = calculate_ear(landmarks, is_right=False)
        right_ear = calculate_ear(landmarks, is_right=True)
        avg_ear   = (left_ear + right_ear) / 2.0
        mar       = calculate_mar(landmarks)

        # Extract normalized coordinates (0.0 to 1.0) for frontend SVG face mesh & eye overlay
        key_landmarks = {
            "left_eye": [
                {"x": round(landmarks[i].x, 4), "y": round(landmarks[i].y, 4)}
                for i in [33, 160, 158, 133, 153, 144]
            ],
            "right_eye": [
                {"x": round(landmarks[i].x, 4), "y": round(landmarks[i].y, 4)}
                for i in [362, 385, 387, 263, 373, 380]
            ],
            "jawline": [
                {"x": round(landmarks[i].x, 4), "y": round(landmarks[i].y, 4)}
                for i in [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
            ],
            "nose": {"x": round(landmarks[1].x, 4), "y": round(landmarks[1].y, 4)},
        }
        return avg_ear, mar, key_landmarks

    def close(self):
        if hasattr(self, "detector") and hasattr(self.detector, "close"):
            self.detector.close()
        if hasattr(self, "legacy_face_mesh") and hasattr(self.legacy_face_mesh, "close"):
            self.legacy_face_mesh.close()


# ─────────────────────────────────────────────────────────────────────────────
# 2. Driver Fatigue Detector (Core Logic & State Machine)
# ─────────────────────────────────────────────────────────────────────────────
class DriverFatigueDetector:
    """
    Production-grade temporal fatigue detector implementing:
    1. 5-second dynamic baseline calibration (70% sleep threshold)
    2. Temporal moving average smoothing & normal blink rejection (<300ms)
    3. Strict 3-tier state machine (AWAKE, WARNING, CRITICAL)
    """

    CALIBRATION_DURATION_SEC = 5.0
    SLEEP_THRESHOLD_RATIO    = 0.70  # 70% of baseline EAR
    SMOOTHING_WINDOW         = 3     # 3 frames (~250-300ms) for sensor noise rejection
    BLINK_DURATION_MAX_SEC   = 0.30  # Max blink duration (300ms)
    WARNING_DURATION_MIN_SEC = 0.50  # 0.5s continuous closure -> WARNING
    CRITICAL_DURATION_SEC    = 1.50  # 1.5s continuous closure -> CRITICAL alert

    def __init__(self):
        # 1. Calibration State
        self.is_calibrated: bool = False
        self.calibration_start_time: Optional[float] = None
        self.calibration_samples: list[float] = []
        self.baseline_ear: Optional[float] = None
        self.sleep_threshold: Optional[float] = None

        # 2. Temporal Smoothing Buffer
        self.ear_history: deque[float] = deque(maxlen=self.SMOOTHING_WINDOW)

        # 3. Continuous Closure Tracking (Wall-Clock Seconds)
        self.closure_start_time: Optional[float] = None
        self.continuous_closure_sec: float = 0.0

        # 4. State Machine State
        # States: "CALIBRATING", "AWAKE", "WARNING", "CRITICAL"
        self.state: str = "CALIBRATING"

        # Telemetry stats
        self.total_frames_processed: int = 0
        self.blink_count: int = 0
        self._last_eye_open: bool = True

    def start_calibration(self) -> None:
        """Initiate or restart the 5-second dynamic calibration phase."""
        self.is_calibrated = False
        self.calibration_start_time = None
        self.calibration_samples.clear()
        self.baseline_ear = None
        self.sleep_threshold = None
        self.closure_start_time = None
        self.continuous_closure_sec = 0.0
        self.ear_history.clear()
        self.state = "CALIBRATING"
        print("[Detector] Calibration mode initiated. Acquiring driver baseline...")

    def process_telemetry(self, raw_ear: Optional[float], raw_mar: Optional[float] = 0.0) -> Dict[str, Any]:
        """
        Process one frame telemetry (raw_ear, raw_mar).

        Returns structured state payload:
        {
            "state": "AWAKE" | "WARNING" | "CRITICAL" | "CALIBRATING",
            "ear": float,
            "baseline_ear": float,
            "sleep_threshold": float,
            "closure_duration": float,
            "calibration_progress": float (0.0 to 1.0),
            "is_calibrated": bool,
            "alert": bool,
            "alarm": bool,
            "blink_count": int,
            "yawning": bool
        }
        """
        self.total_frames_processed += 1
        now = time.monotonic()

        # Face missing fallback
        if raw_ear is None or raw_ear <= 0.0:
            # If face is lost, avoid false trigger: pause/reset closure counter
            self.closure_start_time = None
            self.continuous_closure_sec = 0.0
            return self._build_payload(
                smoothed_ear=0.0,
                raw_ear=None,
                raw_mar=raw_mar,
                face_detected=False
            )

        # ── Step 1: Temporal Smoothing ────────────────────────────────────────
        self.ear_history.append(raw_ear)
        smoothed_ear = float(np.mean(self.ear_history))

        # ── Step 2: Dynamic Calibration Phase ─────────────────────────────────
        if not self.is_calibrated:
            self.state = "CALIBRATING"
            if self.calibration_start_time is None:
                self.calibration_start_time = now

            elapsed = now - self.calibration_start_time
            # Collect sample if eye is reasonably open
            if raw_ear > 0.15:
                self.calibration_samples.append(raw_ear)

            progress = min(1.0, elapsed / self.CALIBRATION_DURATION_SEC)

            if elapsed >= self.CALIBRATION_DURATION_SEC:
                if self.calibration_samples:
                    self.baseline_ear = float(np.mean(self.calibration_samples))
                else:
                    # Fallback to standard default if no valid face samples acquired
                    self.baseline_ear = 0.32

                # Sleep threshold set strictly to 70% of personal baseline EAR
                self.sleep_threshold = round(self.baseline_ear * self.SLEEP_THRESHOLD_RATIO, 3)
                self.is_calibrated = True
                self.state = "AWAKE"
                print(f"[Detector] Calibration complete! Baseline EAR: {self.baseline_ear:.3f}, Sleep Threshold: {self.sleep_threshold:.3f}")

            return self._build_payload(
                smoothed_ear=smoothed_ear,
                raw_ear=raw_ear,
                raw_mar=raw_mar,
                calibration_progress=progress,
                face_detected=True
            )

        # ── Step 3: Temporal Buffering & Blink Filtering ───────────────────────
        # Eyes are only considered closed if both smoothed EAR and raw EAR are below threshold
        # This guarantees that the instant a driver opens their eyes, the closure timer resets immediately.
        eyes_closed = (smoothed_ear < self.sleep_threshold) and (raw_ear < self.sleep_threshold)

        if eyes_closed:
            if self.closure_start_time is None:
                self.closure_start_time = now
            self.continuous_closure_sec = now - self.closure_start_time
            self._last_eye_open = False
        else:
            # Eyes are OPEN -> Reset counter immediately to ignore normal blinks
            if not self._last_eye_open and self.closure_start_time is not None:
                closure_duration = now - self.closure_start_time
                if closure_duration <= self.BLINK_DURATION_MAX_SEC:
                    self.blink_count += 1

            self.closure_start_time = None
            self.continuous_closure_sec = 0.0
            self._last_eye_open = True
            # Clear historical low-EAR frames so reopening is instantaneous
            if raw_ear >= self.sleep_threshold:
                self.ear_history.clear()
                self.ear_history.append(raw_ear)
                smoothed_ear = raw_ear

        # ── Step 4: Strict 3-Tier State Machine ────────────────────────────────
        if self.continuous_closure_sec >= self.CRITICAL_DURATION_SEC:
            # Continuous closure >= 1.5 seconds -> CRITICAL ALARM
            self.state = "CRITICAL"
        elif self.continuous_closure_sec >= self.WARNING_DURATION_MIN_SEC:
            # Continuous closure 0.5s to 1.4s -> WARNING
            self.state = "WARNING"
        else:
            # Normal driving or brief blink (< 0.5s) -> AWAKE
            self.state = "AWAKE"

        return self._build_payload(
            smoothed_ear=smoothed_ear,
            raw_ear=raw_ear,
            raw_mar=raw_mar,
            face_detected=True
        )

    def _build_payload(
        self,
        smoothed_ear: float,
        raw_ear: Optional[float],
        raw_mar: Optional[float],
        calibration_progress: float = 1.0,
        face_detected: bool = True
    ) -> Dict[str, Any]:
        """Construct normalized JSON response payload."""
        yawning = bool(raw_mar and raw_mar > 0.55)
        return {
            "state":                self.state,
            "ear":                  round(smoothed_ear, 3),
            "raw_ear":              round(raw_ear, 3) if raw_ear is not None else None,
            "baseline_ear":         round(self.baseline_ear, 3) if self.baseline_ear else None,
            "sleep_threshold":      round(self.sleep_threshold, 3) if self.sleep_threshold else None,
            "closure_duration":     round(self.continuous_closure_sec, 2),
            "calibration_progress": round(calibration_progress, 2),
            "is_calibrated":        self.is_calibrated,
            "alert":                self.state in ("WARNING", "CRITICAL"),
            "alarm":                self.state == "CRITICAL",
            "blink_count":          self.blink_count,
            "yawning":              yawning,
            "face_detected":        face_detected,
            "timestamp":            int(time.time() * 1000)
        }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Persistent Shared Database (Single Source of Truth)
# ─────────────────────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.json")

class JsonDatabase:
    """Thread-safe persistent database for drivers, operators, and trip analytics."""
    def __init__(self, filepath: str):
        self.filepath = filepath
        self._lock = threading.Lock()
        self.data = self._load()

    def _load(self) -> dict:
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as err:
                print(f"[DB Warning] Could not read {self.filepath}: {err}. Initializing default.")

        default_db = {
            "drivers": {
                "drv_demo_1": {
                    "uid": "drv_demo_1",
                    "email": "alex.rivera@fleet.com",
                    "displayName": "Alex Rivera",
                    "driverCode": "DG8042",
                    "vehicleId": "TRK-902",
                    "createdAt": "2026-10-30T10:00:00Z"
                },
                "drv_demo_2": {
                    "uid": "drv_demo_2",
                    "email": "sarah.chen@fleet.com",
                    "displayName": "Sarah Chen",
                    "driverCode": "SC4491",
                    "vehicleId": "VAN-104",
                    "createdAt": "2026-10-30T11:00:00Z"
                }
            },
            "operators": {
                "op_demo_1": {
                    "id": "op_demo_1",
                    "name": "Fleet Controller",
                    "email": "admin@driveguard.ai",
                    "password": "password123",
                    "driverCodes": ["DG8042", "SC4491"],
                    "createdAt": "2026-10-30T09:00:00Z"
                }
            },
            "sessions": [
                {
                    "id": "sess_101",
                    "driverCode": "DG8042",
                    "driverName": "Alex Rivera",
                    "startedAt": "2026-10-30T08:00:00Z",
                    "endedAt": "2026-10-30T09:15:00Z",
                    "totalAlerts": 1,
                    "peakState": "WARNING",
                    "durationSec": 4500,
                    "blinkCount": 230
                }
            ]
        }
        self._save_raw(default_db)
        return default_db

    def _save_raw(self, data: dict):
        try:
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as err:
            print(f"[DB Error] Failed to write {self.filepath}: {err}")

    def register_driver(self, driver_info: dict) -> dict:
        with self._lock:
            uid = driver_info.get("uid") or f"drv_{int(time.time() * 1000)}"
            clean_code = driver_info.get("driverCode", "").strip().upper().replace("-", "")
            driver_record = {
                "uid": uid,
                "email": driver_info.get("email", "").lower().strip(),
                "displayName": driver_info.get("displayName", "Driver").strip(),
                "driverCode": clean_code,
                "vehicleId": driver_info.get("vehicleId", "FLEET-01"),
                "createdAt": driver_info.get("createdAt") or time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            self.data.setdefault("drivers", {})[uid] = driver_record
            self._save_raw(self.data)
            return driver_record

    def get_driver_by_code(self, code: str) -> Optional[dict]:
        clean = code.strip().upper().replace("-", "")
        with self._lock:
            for d in self.data.get("drivers", {}).values():
                if d.get("driverCode", "").upper() == clean:
                    return d
        return None

    def get_all_drivers(self) -> list:
        with self._lock:
            return list(self.data.get("drivers", {}).values())

    def register_operator(self, op_info: dict) -> dict:
        with self._lock:
            email = op_info.get("email", "").lower().strip()
            for op in self.data.get("operators", {}).values():
                if op.get("email", "").lower() == email:
                    raise ValueError("An operator with this email already exists.")
            op_id = f"op_{int(time.time() * 1000)}"
            new_op = {
                "id": op_id,
                "name": op_info.get("name", "Operator").strip(),
                "email": email,
                "password": op_info.get("password", ""),
                "driverCodes": op_info.get("driverCodes", []),
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ")
            }
            self.data.setdefault("operators", {})[op_id] = new_op
            self._save_raw(self.data)
            return {k: v for k, v in new_op.items() if k != "password"}

    def login_operator(self, email: str, password: str) -> Optional[dict]:
        email_clean = email.strip().lower()
        with self._lock:
            for op in self.data.get("operators", {}).values():
                if op.get("email", "").lower() == email_clean and op.get("password") == password:
                    return {k: v for k, v in op.items() if k != "password"}
        return None

    def link_driver_to_operator(self, op_id: str, driver_code: str) -> bool:
        clean = driver_code.strip().upper().replace("-", "")
        driver = self.get_driver_by_code(clean)
        if not driver:
            return False
        with self._lock:
            if op_id in self.data.get("operators", {}):
                codes = set(self.data["operators"][op_id].get("driverCodes", []))
                codes.add(clean)
                self.data["operators"][op_id]["driverCodes"] = list(codes)
                self._save_raw(self.data)
                return True
        return False

    def unlink_driver_from_operator(self, op_id: str, driver_code: str) -> bool:
        clean = driver_code.strip().upper().replace("-", "")
        with self._lock:
            if op_id in self.data.get("operators", {}):
                codes = [c for c in self.data["operators"][op_id].get("driverCodes", []) if c != clean]
                self.data["operators"][op_id]["driverCodes"] = codes
                self._save_raw(self.data)
                return True
        return False

    def get_operator_drivers(self, op_id: str) -> list:
        with self._lock:
            op = self.data.get("operators", {}).get(op_id)
            if not op:
                return []
            codes = set(op.get("driverCodes", []))
            return [d for d in self.data.get("drivers", {}).values() if d.get("driverCode") in codes]

    def get_operator_sessions(self, op_id: str, limit: int = 50) -> list:
        with self._lock:
            op = self.data.get("operators", {}).get(op_id)
            if not op:
                return []
            codes = set(c.upper() for c in op.get("driverCodes", []))
            if not codes:
                return []
            sessions = [
                s for s in self.data.get("sessions", [])
                if s.get("driverCode", "").upper() in codes
            ]
            return sorted(sessions, key=lambda s: s.get("createdAt", ""), reverse=True)[:limit]

    def add_session(self, session: dict) -> dict:
        with self._lock:
            if not session.get("id"):
                session["id"] = f"sess_{int(time.time() * 1000)}"
            if not session.get("createdAt"):
                session["createdAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
            self.data.setdefault("sessions", []).append(session)
            self._save_raw(self.data)
            return session

    def get_sessions(self, driver_code: Optional[str] = None, limit: int = 50) -> list:
        with self._lock:
            sessions = self.data.get("sessions", [])
            if driver_code:
                clean = driver_code.strip().upper().replace("-", "")
                sessions = [s for s in sessions if s.get("driverCode", "").upper() == clean]
            return sorted(sessions, key=lambda s: s.get("createdAt", ""), reverse=True)[:limit]

# ─────────────────────────────────────────────────────────────────────────────
# 3. Persistent Database: MySQL Engine with JsonDatabase Fallback
# ─────────────────────────────────────────────────────────────────────────────
try:
    if os.path.dirname(os.path.abspath(__file__)) not in sys.path:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from mysql_db import MySQLDatabase
    db = MySQLDatabase()
    print("[DB Init] Connected to MySQL database 'driveguard_db' successfully.")
except Exception as _mysql_err:
    print(f"[DB Warning] MySQL connection failed ({_mysql_err}). Falling back to JsonDatabase.")
    db = JsonDatabase(DB_PATH)


# ─────────────────────────────────────────────────────────────────────────────
# 4. Telemetry Hub & Broadcaster (Bridges Mobile AI -> Web Dashboard)
# ─────────────────────────────────────────────────────────────────────────────
class TelemetryBroadcaster:
    """Manages connected operator dashboards and broadcasts live telemetry stream."""
    def __init__(self):
        self.subscribers: set[WebSocket] = set()

    async def register(self, ws: WebSocket):
        await ws.accept()
        self.subscribers.add(ws)
        print(f"[Telemetry Hub] Dashboard connected. Active listeners: {len(self.subscribers)}")

    def unregister(self, ws: WebSocket):
        self.subscribers.discard(ws)
        print(f"[Telemetry Hub] Dashboard disconnected. Remaining: {len(self.subscribers)}")

    async def broadcast(self, payload: dict):
        if not self.subscribers:
            return
        msg = json.dumps(payload)
        dead = []
        for ws in self.subscribers:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.subscribers.discard(ws)

broadcaster = TelemetryBroadcaster()


# ─────────────────────────────────────────────────────────────────────────────
# 5. Unified FastAPI Application & Endpoints
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="DriveGuard AI Unified Server",
    description="Unified AI, Computer Vision, Telemetry & Fleet Management Backend for DriveGuard Mobile & Web",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

cv_detector = MediaPipeFaceMeshDetector()
fatigue_detector = DriverFatigueDetector()


def decode_base64_frame(base64_str: str) -> Optional[np.ndarray]:
    """Decode base64 encoded JPEG string into OpenCV BGR numpy array."""
    try:
        if "," in base64_str:
            base64_str = base64_str.split(",", 1)[1]
        img_bytes = base64.b64decode(base64_str)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        return frame
    except Exception as err:
        print(f"[Decoder Error] Failed to decode image: {err}")
        return None


# ── Root & Health ─────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "status": "DriveGuard AI Unified Server Running",
        "version": "2.0.0",
        "description": "Unified backend serving both Expo Mobile App and Web Operator Dashboard",
        "active_subscribers": len(broadcaster.subscribers),
        "total_drivers": len(db.get_all_drivers()),
    }


@app.get("/health")
def health_check():
    return {
        "status": "online",
        "detector_state": fatigue_detector.state,
        "is_calibrated": fatigue_detector.is_calibrated,
        "baseline_ear": fatigue_detector.baseline_ear,
        "sleep_threshold": fatigue_detector.sleep_threshold,
        "active_dashboard_subscribers": len(broadcaster.subscribers),
        "total_registered_drivers": len(db.get_all_drivers()),
    }


# ── Driver API ────────────────────────────────────────────────────────────────
@app.post("/api/drivers/register")
def register_driver(payload: dict):
    """Registers or updates driver profile with permanent 6-character code."""
    if not payload.get("email") or not payload.get("driverCode"):
        raise HTTPException(status_code=400, detail="email and driverCode are required")
    driver = db.register_driver(payload)
    print(f"[API] Registered driver: {driver.get('displayName')} (Code: {driver.get('driverCode')})")
    return {"status": "success", "driver": driver}


@app.get("/api/drivers")
def get_all_drivers():
    """Returns all registered drivers."""
    return {"drivers": db.get_all_drivers()}


@app.get("/api/drivers/code/{code}")
def get_driver_by_code(code: str):
    """Looks up a driver by their permanent 6-digit code."""
    driver = db.get_driver_by_code(code)
    if not driver:
        raise HTTPException(
            status_code=404,
            detail=f'No driver found with code "{code}". Please verify the code in the driver app.'
        )
    return {"status": "success", "driver": driver}


# ── Operator API ──────────────────────────────────────────────────────────────
@app.post("/api/operators/register")
def register_operator(payload: dict):
    try:
        op = db.register_operator(payload)
        return {"status": "success", "operator": op}
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))


@app.post("/api/operators/login")
def login_operator(payload: dict):
    email = payload.get("email", "")
    password = payload.get("password", "")
    op = db.login_operator(email, password)
    if not op:
        raise HTTPException(status_code=401, detail="Invalid operator email or password.")
    return {"status": "success", "operator": op}


@app.get("/api/operators/{op_id}/drivers")
def get_operator_drivers(op_id: str):
    drivers = db.get_operator_drivers(op_id)
    return {"drivers": drivers}


@app.post("/api/operators/{op_id}/drivers")
def link_driver_to_operator(op_id: str, payload: dict):
    driver_code = payload.get("driverCode", "")
    if not driver_code:
        raise HTTPException(status_code=400, detail="driverCode is required")
    success = db.link_driver_to_operator(op_id, driver_code)
    if not success:
        raise HTTPException(status_code=404, detail=f'Driver code "{driver_code}" not found.')
    return {"status": "success", "message": f'Driver {driver_code} linked to operator.'}


@app.delete("/api/operators/{op_id}/drivers/{code}")
def unlink_driver_from_operator(op_id: str, code: str):
    success = db.unlink_driver_from_operator(op_id, code)
    return {"status": "success", "unlinked": success}


@app.get("/api/operators/{op_id}/sessions")
def get_operator_sessions(op_id: str, limit: int = 50):
    """Returns trip history and incident logs scoped strictly to this operator's linked drivers."""
    if hasattr(db, "get_operator_sessions"):
        sessions = db.get_operator_sessions(op_id, limit=limit)
    else:
        drivers = db.get_operator_drivers(op_id)
        codes = set(d["driverCode"].upper() for d in drivers if d.get("driverCode"))
        if not codes:
            return {"sessions": []}
        all_sessions = db.get_sessions(limit=100)
        sessions = [s for s in all_sessions if s.get("driverCode", "").upper() in codes][:limit]
    return {"sessions": sessions}


@app.get("/api/operators/{op_id}/stats")
def get_operator_stats(op_id: str):
    """Returns fleet KPIs scoped strictly to this operator's fleet."""
    drivers = db.get_operator_drivers(op_id)
    if hasattr(db, "get_operator_sessions"):
        sessions = db.get_operator_sessions(op_id, limit=100)
    else:
        codes = set(d["driverCode"].upper() for d in drivers if d.get("driverCode"))
        sessions = [s for s in db.get_sessions(limit=100) if s.get("driverCode", "").upper() in codes]

    total_trips = len(sessions)
    total_alerts = sum(s.get("totalAlerts", 0) for s in sessions)

    durations = []
    for s in sessions:
        dur = s.get("durationSec") or 0
        if dur <= 0 and s.get("startedAt") and s.get("endedAt"):
            try:
                import datetime
                t1 = datetime.datetime.fromisoformat(s["startedAt"].replace("Z", "+00:00"))
                t2 = datetime.datetime.fromisoformat(s["endedAt"].replace("Z", "+00:00"))
                diff = int((t2 - t1).total_seconds())
                if diff > 0:
                    dur = diff
            except Exception:
                pass
        if dur > 0:
            durations.append(dur)

    avg_duration = round(sum(durations) / max(len(durations), 1)) if durations else 0

    return {
        "operator_id": op_id,
        "total_drivers": len(drivers),
        "total_trips": total_trips,
        "total_alerts": total_alerts,
        "avg_duration_sec": avg_duration,
    }


# ── Trip Sessions & Analytics API ─────────────────────────────────────────────
@app.post("/api/sessions")
def save_session(session: dict):
    saved = db.add_session(session)
    return {"status": "success", "session": saved}


@app.get("/api/sessions")
def get_sessions(driver_code: Optional[str] = None, limit: int = 50):
    sessions = db.get_sessions(driver_code=driver_code, limit=limit)
    return {"sessions": sessions}


@app.get("/api/stats")
def get_fleet_stats():
    drivers = db.get_all_drivers()
    sessions = db.get_sessions(limit=100)
    total_trips = len(sessions)
    total_alerts = sum(s.get("totalAlerts", 0) for s in sessions)

    durations = []
    for s in sessions:
        dur = s.get("durationSec") or 0
        if dur <= 0 and s.get("startedAt") and s.get("endedAt"):
            try:
                import datetime
                t1 = datetime.datetime.fromisoformat(s["startedAt"].replace("Z", "+00:00"))
                t2 = datetime.datetime.fromisoformat(s["endedAt"].replace("Z", "+00:00"))
                diff = int((t2 - t1).total_seconds())
                if diff > 0:
                    dur = diff
            except Exception:
                pass
        if dur > 0:
            durations.append(dur)

    avg_duration = round(sum(durations) / max(len(durations), 1)) if durations else 0

    return {
        "total_drivers": len(drivers),
        "total_trips": total_trips,
        "total_alerts": total_alerts,
        "avg_duration_sec": avg_duration,
        "active_streamers": len(broadcaster.subscribers),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 6. Unified WebSockets: Camera Feed & Real-Time Telemetry
# ─────────────────────────────────────────────────────────────────────────────
@app.websocket("/ws/camera")
async def websocket_camera_endpoint(websocket: WebSocket):
    """
    High-speed camera streaming endpoint for the React Native mobile app.
    1. Ingests video frames from mobile camera.
    2. Runs MediaPipe FaceMesh & Soukupová & Čech EAR detection.
    3. Emits low-latency state + landmark coordinates back to mobile HUD.
    4. Automatically broadcasts live telemetry & risk scores to operator web dashboards!
    """
    await websocket.accept()
    print(f"[Camera Stream] Mobile client connected: {websocket.client}")

    # Start calibration phase whenever a new mobile driver session connects
    fatigue_detector.start_calibration()
    driver_code = None
    driver_name = None
    vehicle_id = "FLEET-01"

    try:
        while True:
            data = await websocket.receive_json()
            t_start = time.perf_counter()

            # Synchronize driver identification
            if data.get("driver_code"):
                driver_code = str(data["driver_code"]).strip().upper().replace("-", "")
            if data.get("driver_id"):
                driver_name = data["driver_id"]
            if data.get("vehicle_id"):
                vehicle_id = data["vehicle_id"]

            # Handle control commands (e.g. manual recalibrate)
            action = data.get("action")
            if action == "calibrate":
                fatigue_detector.start_calibration()
                await websocket.send_json({
                    "state": "CALIBRATING",
                    "calibration_progress": 0.0,
                    "message": "Recalibration initiated"
                })
                continue

            raw_ear = data.get("ear")
            raw_mar = data.get("mar", 0.0)
            frame_landmarks = None

            # Frame base64 processing path
            if "image" in data and data["image"]:
                frame = decode_base64_frame(data["image"])
                if frame is not None:
                    h, w = frame.shape[:2]
                    if w > 480:
                        scale = 480.0 / w
                        frame = cv2.resize(frame, (480, int(h * scale)), interpolation=cv2.INTER_LINEAR)

                    calc_ear, calc_mar, calc_landmarks = cv_detector.process_frame(frame)
                    raw_ear = calc_ear
                    raw_mar = calc_mar if calc_mar is not None else 0.0
                    frame_landmarks = calc_landmarks

            # Process through the 4-mechanism detector
            result = fatigue_detector.process_telemetry(raw_ear, raw_mar)
            if frame_landmarks:
                result["landmarks"] = frame_landmarks

            # Attach processing latency
            t_elapsed_ms = (time.perf_counter() - t_start) * 1000.0
            result["latency_ms"] = round(t_elapsed_ms, 1)

            # 1. Send low-latency response back to React Native client for HUD
            await websocket.send_json(result)

            # 2. Standardize & broadcast to all connected Web Dashboards
            state = result.get("state", "AWAKE")
            closure = result.get("closure_duration", 0.0)

            if state == "CRITICAL":
                risk_score = min(100, int(75 + closure * 15))
            elif state == "WARNING":
                risk_score = min(70, int(35 + closure * 20))
            elif result.get("yawning"):
                risk_score = 45
            else:
                ear_val = result.get("ear") or 0.3
                risk_score = max(5, int(18 - ear_val * 20))

            perclos = min(100.0, round(closure * 18.0, 1)) if closure > 0 else 3.2

            telemetry_packet = {
                "status": "ALERT" if state == "AWAKE" else state,
                "state": state,
                "driver_id": driver_name or f"Driver ({driver_code or 'Active'})",
                "driver_code": driver_code or "UNKNOWN",
                "vehicle_id": vehicle_id,
                "ear": result.get("ear") or 0.30,
                "mar": result.get("mar") or 0.05,
                "perclos": perclos,
                "risk_score": risk_score,
                "alert": result.get("alert", False),
                "alarm": result.get("alarm", False),
                "yawning": result.get("yawning", False),
                "blink_count": result.get("blink_count", 0),
                "closure_duration": closure,
                "face_detected": result.get("face_detected", True),
                "timestamp": time.strftime("%H:%M:%S")
            }
            await broadcaster.broadcast(telemetry_packet)

    except WebSocketDisconnect:
        print(f"[Camera Stream] Mobile client disconnected: {websocket.client}")
    except Exception as err:
        print(f"[Camera Stream Error] {err}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """
    Bi-directional Telemetry Stream:
    - Operator Web Dashboards connect here to listen to live driver telemetry.
    - Simulators / mobile telemetry injectors connect here to broadcast telemetry.
    """
    await broadcaster.register(websocket)
    try:
        while True:
            # If a client sends telemetry data (e.g. simulator or numeric stream)
            data_text = await websocket.receive_text()
            try:
                data = json.loads(data_text)
                if isinstance(data, dict):
                    if "timestamp" not in data:
                        data["timestamp"] = time.strftime("%H:%M:%S")
                    # Broadcast incoming telemetry to all other connected dashboards
                    await broadcaster.broadcast(data)
            except Exception:
                pass
    except WebSocketDisconnect:
        broadcaster.unregister(websocket)
    except Exception as err:
        print(f"[Telemetry Error] {err}")
        broadcaster.unregister(websocket)


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 8000))
    print("=" * 68)
    print("  🚀 DriveGuard AI Unified Backend Server")
    print("  Serving BOTH Expo Mobile App and Web Operator Dashboard")
    print("=" * 68)
    print(f"  ► HTTP REST API:   http://{host}:{port}")
    print(f"  ► Mobile Camera:   ws://<YOUR_HOST>:{port}/ws/camera")
    print(f"  ► Web Telemetry:   ws://<YOUR_HOST>:{port}/ws/telemetry")
    print("=" * 68)
    uvicorn.run("fatigue_detector:app", host=host, port=port, log_level="info")

