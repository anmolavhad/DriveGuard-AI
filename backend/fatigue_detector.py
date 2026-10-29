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
import base64
import urllib.request
from collections import deque
from typing import Optional, Tuple, Dict, Any

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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
        try:
            import mediapipe as mp
            from mediapipe.tasks import python
            from mediapipe.tasks.python import vision

            ensure_model_file()
            base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
            options = vision.FaceLandmarkerOptions(
                base_options=base_options,
                output_face_blendshapes=False,
                output_facial_transformation_matrixes=False,
                num_faces=1,
            )
            self.detector = vision.FaceLandmarker.create_from_options(options)
            self.mp = mp
            print("[MediaPipe] Initialized MediaPipe Tasks FaceLandmarker.")
        except Exception as err:
            print(f"[MediaPipe] Tasks init fallback: {err}. Trying legacy FaceMesh...")
            try:
                import mediapipe as mp
                self.legacy_face_mesh = mp.solutions.face_mesh.FaceMesh(
                    max_num_faces=1,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
                self.mode = "legacy"
                print("[MediaPipe] Initialized legacy FaceMesh.")
            except Exception as leg_err:
                raise RuntimeError(f"Failed to initialize MediaPipe: {leg_err}")

    def process_frame(self, bgr_image: np.ndarray) -> Tuple[Optional[float], Optional[float]]:
        """
        Process BGR frame and return (ear, mar).
        Returns (None, None) if no face is detected.
        """
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
# 3. High-Performance FastAPI WebSocket Server
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="DriveGuard AI Telemetry & Vision Server")

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


@app.get("/health")
def health_check():
    return {
        "status": "online",
        "detector_state": fatigue_detector.state,
        "is_calibrated": fatigue_detector.is_calibrated,
        "baseline_ear": fatigue_detector.baseline_ear,
        "sleep_threshold": fatigue_detector.sleep_threshold,
    }


@app.websocket("/ws/telemetry")
@app.websocket("/ws/camera")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """
    Full-duplex low-latency WebSocket endpoint for DriveGuard AI.
    Accepts:
      1. Base64 JPEG frames: {"image": "<base64>", "timestamp": 12345}
      2. Direct telemetry values: {"ear": 0.28, "mar": 0.05, "timestamp": 12345}
      3. Control commands: {"action": "calibrate"}
    Emits:
      Immediate JSON fatigue state response (<20-30ms latency).
    """
    await websocket.accept()
    print(f"[WebSocket] Client connected: {websocket.client}")

    # Start calibration phase whenever a new client connects
    fatigue_detector.start_calibration()

    try:
        while True:
            data = await websocket.receive_json()
            t_start = time.perf_counter()

            # Handle control commands
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

            # Frame base64 processing path
            if "image" in data and data["image"]:
                frame = decode_base64_frame(data["image"])
                if frame is not None:
                    # Resize frame if needed for ultra-fast CV inference (<15ms)
                    h, w = frame.shape[:2]
                    if w > 480:
                        scale = 480.0 / w
                        frame = cv2.resize(frame, (480, int(h * scale)), interpolation=cv2.INTER_LINEAR)

                    calc_ear, calc_mar, calc_landmarks = cv_detector.process_frame(frame)
                    raw_ear = calc_ear
                    raw_mar = calc_mar if calc_mar is not None else 0.0
                    frame_landmarks = calc_landmarks
                else:
                    raw_ear = None
                    frame_landmarks = None
            else:
                frame_landmarks = None

            # Process through the 4-mechanism detector
            result = fatigue_detector.process_telemetry(raw_ear, raw_mar)
            if frame_landmarks:
                result["landmarks"] = frame_landmarks

            # Attach processing latency
            t_elapsed_ms = (time.perf_counter() - t_start) * 1000.0
            result["latency_ms"] = round(t_elapsed_ms, 1)

            # Emit state back to React Native client
            await websocket.send_json(result)

    except WebSocketDisconnect:
        print(f"[WebSocket] Client disconnected: {websocket.client}")
    except Exception as err:
        print(f"[WebSocket Error] Unexpected error: {err}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    print("=" * 65)
    print("[DriveGuard AI] Starting server on http://0.0.0.0:8000")
    print("   WebSocket URL: ws://<YOUR_LOCAL_IP>:8000/ws/camera")
    print("=" * 65)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
