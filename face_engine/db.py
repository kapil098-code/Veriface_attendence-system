"""Data access bridge supporting Express REST API and parameterized MySQL 8.0."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import mysql.connector
import numpy as np
import requests

from config import CONFIG


def encode_to_blob(encoding: np.ndarray) -> bytes:
    """Serialize a 128-d float64 NumPy vector to JSON bytes for MySQL BLOB storage."""
    vector = np.asarray(encoding, dtype=np.float64).tolist()
    return json.dumps(vector).encode("utf-8")


def decode_from_blob(raw: Any) -> np.ndarray:
    """Deserialize either JSON-encoded float array or raw 1024-byte float64 buffer."""
    if isinstance(raw, (bytes, bytearray)):
        text = raw.decode("utf-8", errors="ignore").strip()
        if text.startswith("["):
            return np.asarray(json.loads(text), dtype=np.float64)
        return np.frombuffer(raw, dtype=np.float64)
    if isinstance(raw, str):
        return np.asarray(json.loads(raw), dtype=np.float64)
    return np.asarray(raw, dtype=np.float64)


class MySQLStore:
    """Direct parameterized MySQL 8.0 client for the face_attendance_db schema."""

    def __init__(self) -> None:
        self._conn = mysql.connector.connect(
            host=CONFIG.mysql_host,
            port=CONFIG.mysql_port,
            user=CONFIG.mysql_user,
            password=CONFIG.mysql_password,
            database=CONFIG.mysql_database,
            autocommit=True,
        )

    def fetch_known_users(self) -> List[Dict[str, Any]]:
        cursor = self._conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT u.user_id, u.name, u.roll_no, d.department_name, u.role, u.face_encoding
            FROM users u
            INNER JOIN departments d ON d.department_id = u.department_id
            ORDER BY u.user_id ASC
            """
        )
        rows = cursor.fetchall()
        cursor.close()
        users = []
        for row in rows:
            users.append(
                {
                    "user_id": row["user_id"],
                    "name": row["name"],
                    "roll_no": row["roll_no"],
                    "department_name": row["department_name"],
                    "role": row["role"],
                    "encoding": decode_from_blob(row["face_encoding"]),
                }
            )
        return users

    def register_user(
        self,
        name: str,
        roll_no: str,
        department_id: int,
        role: str,
        encoding: np.ndarray,
    ) -> int:
        cursor = self._conn.cursor()
        cursor.execute(
            """
            INSERT INTO users (name, roll_no, department_id, role, face_encoding)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (name, roll_no, department_id, role, encode_to_blob(encoding)),
        )
        user_id = cursor.lastrowid
        cursor.close()
        return int(user_id)

    def log_attendance(
        self,
        user_id: int,
        confidence_score: float,
        window_minutes: int = CONFIG.duplicate_window_minutes,
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        now = datetime.now()
        today_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")
        cursor = self._conn.cursor(dictionary=True)

        # Duplicate check within configurable time window on the same date
        cursor.execute(
            """
            SELECT attendance_id, date, time_in, status, confidence_score
            FROM attendance
            WHERE user_id = %s
              AND date = %s
              AND TIMESTAMPDIFF(MINUTE, TIMESTAMP(date, time_in), %s) < %s
            ORDER BY attendance_id DESC
            LIMIT 1
            """,
            (user_id, today_str, now.strftime("%Y-%m-%d %H:%M:%S"), window_minutes),
        )
        existing = cursor.fetchone()
        if existing:
            cursor.close()
            return "duplicate", existing

        status = "Late" if time_str > CONFIG.late_after_time else "Present"
        cursor.execute(
            """
            INSERT INTO attendance (user_id, date, time_in, status, confidence_score)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (user_id, today_str, time_str, status, round(float(confidence_score), 4)),
        )
        attendance_id = cursor.lastrowid
        cursor.close()
        return "marked", {
            "attendance_id": attendance_id,
            "user_id": user_id,
            "date": today_str,
            "time_in": time_str,
            "status": status,
            "confidence_score": round(float(confidence_score), 4),
        }


class ExpressBridgeClient:
    """REST API client communicating with the Node.js/Express backend."""

    def __init__(self) -> None:
        self.base_url = CONFIG.backend_api_url.rstrip("/")
        self.headers = {"Content-Type": "application/json"}
        if CONFIG.engine_api_key:
            self.headers["x-engine-key"] = CONFIG.engine_api_key

    def fetch_known_users(self) -> List[Dict[str, Any]]:
        resp = requests.get(
            f"{self.base_url}/api/engine/encodings",
            headers=self.headers,
            timeout=10,
        )
        resp.raise_for_status()
        payload = resp.json()
        users = []
        for item in payload.get("users", []):
            users.append(
                {
                    "user_id": item["user_id"],
                    "name": item["name"],
                    "roll_no": item["roll_no"],
                    "department_name": item.get("department_name", ""),
                    "role": item.get("role", "Student"),
                    "encoding": np.asarray(item["face_encoding"], dtype=np.float64),
                }
            )
        return users

    def post_recognition_sample(
        self,
        encoding: np.ndarray,
        tolerance: float = CONFIG.match_tolerance,
    ) -> Dict[str, Any]:
        resp = requests.post(
            f"{self.base_url}/api/attendance/recognize",
            headers=self.headers,
            json={
                "encoding": np.asarray(encoding, dtype=np.float64).tolist(),
                "threshold": tolerance,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def register_user(
        self,
        name: str,
        roll_no: str,
        department_id: int,
        role: str,
        encoding: np.ndarray,
    ) -> Dict[str, Any]:
        resp = requests.post(
            f"{self.base_url}/api/engine/users",
            headers=self.headers,
            json={
                "name": name,
                "roll_no": roll_no,
                "department_id": department_id,
                "role": role,
                "face_encoding": np.asarray(encoding, dtype=np.float64).tolist(),
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
