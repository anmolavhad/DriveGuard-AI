"""
MySQL Database Adapter for DriveGuard Ecosystem
Provides a production-grade relational database backend for drivers, operators,
and driving session telemetry with connection pooling and thread safety.
"""

import os
import time
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
import pymysql
from pymysql.cursors import DictCursor

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

class MySQLDatabase:
    """Thread-safe MySQL database adapter for DriveGuard."""

    def __init__(
        self,
        host: str = None,
        port: int = None,
        user: str = None,
        password: str = None,
        database: str = None
    ):
        self.host = host or os.environ.get("MYSQL_HOST", "localhost")
        self.port = int(port or os.environ.get("MYSQL_PORT", 3306))
        self.user = user or os.environ.get("MYSQL_USER", "root")
        self.password = password or os.environ.get("MYSQL_PASSWORD", "")
        self.database = database or os.environ.get("MYSQL_DB", "driveguard_db")
        
        self._init_database()

    def _get_connection(self, include_db: bool = True):
        return pymysql.connect(
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password,
            database=self.database if include_db else None,
            charset="utf8mb4",
            cursorclass=DictCursor,
            autocommit=True
        )

    def _init_database(self):
        """Ensures the database and required tables exist with connection retry for cloud/containers."""
        # 1. Connect with retry to allow MySQL container warmup
        conn = None
        retries = 6
        for attempt in range(1, retries + 1):
            try:
                conn = self._get_connection(include_db=False)
                break
            except Exception as e:
                if attempt == retries:
                    raise e
                print(f"[MySQL Warmup] Waiting for database (attempt {attempt}/{retries})...")
                time.sleep(2)

        try:
            with conn.cursor() as cur:
                cur.execute(f"CREATE DATABASE IF NOT EXISTS `{self.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
        finally:
            conn.close()

        # 2. Create tables
        conn = self._get_connection(include_db=True)
        try:
            with conn.cursor() as cur:
                cur.execute("""
                CREATE TABLE IF NOT EXISTS drivers (
                    uid VARCHAR(64) PRIMARY KEY,
                    email VARCHAR(128) NOT NULL UNIQUE,
                    display_name VARCHAR(128) NOT NULL,
                    driver_code VARCHAR(16) NOT NULL UNIQUE,
                    vehicle_id VARCHAR(64) DEFAULT 'FLEET-01',
                    created_at VARCHAR(64) NOT NULL,
                    INDEX idx_drivers_code (driver_code)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """)

                cur.execute("""
                CREATE TABLE IF NOT EXISTS operators (
                    id VARCHAR(64) PRIMARY KEY,
                    name VARCHAR(128) NOT NULL,
                    email VARCHAR(128) NOT NULL UNIQUE,
                    password VARCHAR(255) NOT NULL,
                    created_at VARCHAR(64) NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """)

                cur.execute("""
                CREATE TABLE IF NOT EXISTS operator_drivers (
                    operator_id VARCHAR(64) NOT NULL,
                    driver_code VARCHAR(16) NOT NULL,
                    PRIMARY KEY (operator_id, driver_code),
                    FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE CASCADE,
                    INDEX idx_op_driver (driver_code)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """)

                cur.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id VARCHAR(64) PRIMARY KEY,
                    driver_code VARCHAR(16) NOT NULL,
                    driver_name VARCHAR(128),
                    started_at VARCHAR(64),
                    ended_at VARCHAR(64),
                    total_alerts INT DEFAULT 0,
                    peak_state VARCHAR(32) DEFAULT 'NORMAL',
                    duration_sec INT DEFAULT 0,
                    blink_count INT DEFAULT 0,
                    created_at VARCHAR(64) NOT NULL,
                    INDEX idx_sessions_driver (driver_code)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """)
        finally:
            conn.close()

    # ── Driver Operations ──────────────────────────────────────────────────────

    def register_driver(self, driver_info: dict) -> dict:
        uid = driver_info.get("uid") or f"drv_{int(time.time() * 1000)}"
        clean_code = driver_info.get("driverCode", "").strip().upper().replace("-", "")
        email = driver_info.get("email", "").lower().strip()
        display_name = driver_info.get("displayName", "Driver").strip()
        vehicle_id = driver_info.get("vehicleId", "FLEET-01")
        created_at = driver_info.get("createdAt") or time.strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO drivers (uid, email, display_name, driver_code, vehicle_id, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        email = VALUES(email),
                        display_name = VALUES(display_name),
                        vehicle_id = VALUES(vehicle_id);
                """, (uid, email, display_name, clean_code, vehicle_id, created_at))
        finally:
            conn.close()

        return {
            "uid": uid,
            "email": email,
            "displayName": display_name,
            "driverCode": clean_code,
            "vehicleId": vehicle_id,
            "createdAt": created_at,
        }

    def get_driver_by_code(self, code: str) -> Optional[dict]:
        clean = code.strip().upper().replace("-", "")
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT uid, email, display_name AS displayName, driver_code AS driverCode,
                           vehicle_id AS vehicleId, created_at AS createdAt
                    FROM drivers WHERE driver_code = %s;
                """, (clean,))
                return cur.fetchone()
        finally:
            conn.close()

    def get_all_drivers(self) -> List[dict]:
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT uid, email, display_name AS displayName, driver_code AS driverCode,
                           vehicle_id AS vehicleId, created_at AS createdAt
                    FROM drivers ORDER BY created_at DESC;
                """)
                return cur.fetchall()
        finally:
            conn.close()

    # ── Operator Operations ────────────────────────────────────────────────────

    def register_operator(self, op_info: dict) -> dict:
        email = op_info.get("email", "").lower().strip()
        name = op_info.get("name", "Operator").strip()
        password = op_info.get("password", "")
        op_id = f"op_{int(time.time() * 1000)}"
        created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                # Check email uniqueness
                cur.execute("SELECT id FROM operators WHERE email = %s;", (email,))
                if cur.fetchone():
                    raise ValueError("An operator with this email already exists.")

                cur.execute("""
                    INSERT INTO operators (id, name, email, password, created_at)
                    VALUES (%s, %s, %s, %s, %s);
                """, (op_id, name, email, password, created_at))

                # Insert any initial driver codes
                driver_codes = op_info.get("driverCodes", [])
                for code in driver_codes:
                    clean = code.strip().upper().replace("-", "")
                    cur.execute("""
                        INSERT IGNORE INTO operator_drivers (operator_id, driver_code)
                        VALUES (%s, %s);
                    """, (op_id, clean))
        finally:
            conn.close()

        return {
            "id": op_id,
            "name": name,
            "email": email,
            "driverCodes": op_info.get("driverCodes", []),
            "createdAt": created_at
        }

    def login_operator(self, email: str, password: str) -> Optional[dict]:
        email_clean = email.strip().lower()
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, name, email, created_at AS createdAt
                    FROM operators WHERE email = %s AND password = %s;
                """, (email_clean, password))
                op = cur.fetchone()
                if not op:
                    return None

                # Fetch linked driver codes
                cur.execute("""
                    SELECT driver_code FROM operator_drivers WHERE operator_id = %s;
                """, (op["id"],))
                op["driverCodes"] = [r["driver_code"] for r in cur.fetchall()]
                return op
        finally:
            conn.close()

    def link_driver_to_operator(self, op_id: str, driver_code: str) -> bool:
        clean = driver_code.strip().upper().replace("-", "")
        driver = self.get_driver_by_code(clean)
        if not driver:
            return False

        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM operators WHERE id = %s;", (op_id,))
                if not cur.fetchone():
                    return False

                cur.execute("""
                    INSERT IGNORE INTO operator_drivers (operator_id, driver_code)
                    VALUES (%s, %s);
                """, (op_id, clean))
                return True
        finally:
            conn.close()

    def unlink_driver_from_operator(self, op_id: str, driver_code: str) -> bool:
        clean = driver_code.strip().upper().replace("-", "")
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM operator_drivers
                    WHERE operator_id = %s AND driver_code = %s;
                """, (op_id, clean))
                return cur.rowcount > 0
        finally:
            conn.close()

    def get_operator_drivers(self, op_id: str) -> List[dict]:
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT d.uid, d.email, d.display_name AS displayName, d.driver_code AS driverCode,
                           d.vehicle_id AS vehicleId, d.created_at AS createdAt
                    FROM drivers d
                    INNER JOIN operator_drivers od ON d.driver_code = od.driver_code
                    WHERE od.operator_id = %s
                    ORDER BY d.display_name ASC;
                """, (op_id,))
                return cur.fetchall()
        finally:
            conn.close()

    def get_operator_sessions(self, op_id: str, limit: int = 50) -> List[dict]:
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT s.id, s.driver_code AS driverCode, s.driver_name AS driverName,
                           s.started_at AS startedAt, s.ended_at AS endedAt,
                           s.total_alerts AS totalAlerts, s.peak_state AS peakState,
                           s.duration_sec AS durationSec, s.blink_count AS blinkCount,
                           s.created_at AS createdAt
                    FROM sessions s
                    INNER JOIN operator_drivers od ON s.driver_code = od.driver_code
                    WHERE od.operator_id = %s
                    ORDER BY s.created_at DESC
                    LIMIT %s;
                """, (op_id, limit))
                return cur.fetchall()
        finally:
            conn.close()

    # ── Session & Telemetry Operations ─────────────────────────────────────────

    def add_session(self, session: dict) -> dict:
        sess_id = session.get("id") or f"sess_{int(time.time() * 1000)}"
        clean_code = session.get("driverCode", "").strip().upper().replace("-", "")
        driver_name = session.get("driverName", "Driver")
        started_at = session.get("startedAt", "")
        ended_at = session.get("endedAt", "")
        total_alerts = int(session.get("totalAlerts", 0))
        peak_state = session.get("peakState", "NORMAL")
        duration_sec = int(session.get("durationSec", 0))
        blink_count = int(session.get("blinkCount", 0))
        created_at = session.get("createdAt") or time.strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO sessions (
                        id, driver_code, driver_name, started_at, ended_at,
                        total_alerts, peak_state, duration_sec, blink_count, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        driver_name = VALUES(driver_name),
                        total_alerts = VALUES(total_alerts),
                        peak_state = VALUES(peak_state),
                        duration_sec = VALUES(duration_sec),
                        blink_count = VALUES(blink_count);
                """, (
                    sess_id, clean_code, driver_name, started_at, ended_at,
                    total_alerts, peak_state, duration_sec, blink_count, created_at
                ))
        finally:
            conn.close()

        session["id"] = sess_id
        session["createdAt"] = created_at
        return session

    def get_sessions(self, driver_code: Optional[str] = None, limit: int = 50) -> List[dict]:
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                if driver_code:
                    clean = driver_code.strip().upper().replace("-", "")
                    cur.execute("""
                        SELECT id, driver_code AS driverCode, driver_name AS driverName,
                               started_at AS startedAt, ended_at AS endedAt,
                               total_alerts AS totalAlerts, peak_state AS peakState,
                               duration_sec AS durationSec, blink_count AS blinkCount,
                               created_at AS createdAt
                        FROM sessions
                        WHERE driver_code = %s
                        ORDER BY created_at DESC
                        LIMIT %s;
                    """, (clean, limit))
                else:
                    cur.execute("""
                        SELECT id, driver_code AS driverCode, driver_name AS driverName,
                               started_at AS startedAt, ended_at AS endedAt,
                               total_alerts AS totalAlerts, peak_state AS peakState,
                               duration_sec AS durationSec, blink_count AS blinkCount,
                               created_at AS createdAt
                        FROM sessions
                        ORDER BY created_at DESC
                        LIMIT %s;
                    """, (limit,))
                return cur.fetchall()
        finally:
            conn.close()
