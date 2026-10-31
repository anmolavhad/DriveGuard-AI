"""
simulator.py
────────────
DriveGuard AI — Mock Telemetry Simulator
Injects simulated driver fatigue telemetry directly into the DriveGuard unified backend.
Useful for demonstrating or testing the Web Dashboard when no mobile camera is connected.
"""

import asyncio
import json
import random
import time
import websockets

async def simulate_driver_telemetry():
    uri = "ws://localhost:8000/ws/telemetry"
    print("🚀 Connecting to DriveGuard Unified WebSocket Server on ws://localhost:8000/ws/telemetry...")

    async with websockets.connect(uri) as websocket:
        print("✅ Connected! Starting live driver telemetry stream...\n")

        # Simulation scenarios: Normal, Yawning, Microsleep
        scenarios = ["NORMAL", "NORMAL", "YAWNING", "NORMAL", "MICROSLEEP", "NORMAL"]

        while True:
            scenario = random.choice(scenarios)

            if scenario == "NORMAL":
                ear = round(random.uniform(0.28, 0.35), 2)
                mar = round(random.uniform(0.10, 0.25), 2)
                perclos = round(random.uniform(2.0, 6.0), 1)
                risk_score = random.randint(5, 20)
                status = "ALERT"

            elif scenario == "YAWNING":
                ear = round(random.uniform(0.22, 0.27), 2)
                mar = round(random.uniform(0.65, 0.85), 2)  # High MAR = Yawn
                perclos = round(random.uniform(8.0, 14.0), 1)
                risk_score = random.randint(35, 55)
                status = "WARNING"

            elif scenario == "MICROSLEEP":
                ear = round(random.uniform(0.08, 0.15), 2)  # Low EAR = Eyes Closed
                mar = round(random.uniform(0.15, 0.30), 2)
                perclos = round(random.uniform(18.0, 32.0), 1)  # High PERCLOS
                risk_score = random.randint(75, 98)
                status = "CRITICAL"

            payload = {
                "driver_id": "Alex Rivera",
                "driver_code": "DG8042",
                "vehicle_id": "TRK-902",
                "ear": ear,
                "mar": mar,
                "perclos": perclos,
                "risk_score": risk_score,
                "status": status,
                "timestamp": time.strftime("%H:%M:%S")
            }

            # Send JSON over WebSocket
            await websocket.send(json.dumps(payload))
            print(f"📡 Sent Telemetry | Status: {status:<8} | EAR: {ear} | MAR: {mar} | Risk: {risk_score}% | Driver: {payload['driver_id']}")

            # Wait 1.5 seconds between frame bursts
            await asyncio.sleep(1.5)

if __name__ == "__main__":
    try:
        asyncio.run(simulate_driver_telemetry())
    except KeyboardInterrupt:
        print("\n🛑 Simulation Stopped.")
    except Exception as e:
        print(f"\n❌ Error connecting to server: {e}\nMake sure fatigue_detector.py is running on port 8000!")

