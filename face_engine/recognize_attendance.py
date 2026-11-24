"""Real-time webcam attendance recognition service (OpenCV + dlib + NumPy)."""
from __future__ import annotations

import argparse
import sys
import time
from typing import Dict

import cv2
import face_recognition
import numpy as np

from config import CONFIG
from db import ExpressBridgeClient, MySQLStore


def run_recognition(direct_db: bool = False, refresh_seconds: int = 30) -> int:
    backend = MySQLStore() if direct_db else ExpressBridgeClient()

    known_users = backend.fetch_known_users()
    known_encodings = [u["encoding"] for u in known_users]
    last_refresh = time.time()

    # Local cooldown cache prevents redundant API/DB hits while person stays in frame
    local_cooldown: Dict[int, float] = {}
    cooldown_sec = CONFIG.duplicate_window_minutes * 60

    cap = cv2.VideoCapture(CONFIG.camera_index)
    if not cap.isOpened():
        raise RuntimeError(f"Unable to open camera index {CONFIG.camera_index}")

    print(
        f"[VeriFace] Recognition active | Loaded {len(known_users)} profiles | "
        f"Tolerance={CONFIG.match_tolerance} | Mode={'MySQL' if direct_db else 'Express API'}"
    )
    print("[VeriFace] Press 'r' to reload encodings or 'q' to quit.")

    process_frame = True
    cached_boxes = []

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                continue

            now = time.time()
            if now - last_refresh >= refresh_seconds:
                known_users = backend.fetch_known_users()
                known_encodings = [u["encoding"] for u in known_users]
                last_refresh = now

            if process_frame:
                small = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
                rgb_small = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
                locations = face_recognition.face_locations(rgb_small, model=CONFIG.detection_model)
                encodings = face_recognition.face_encodings(rgb_small, locations)

                cached_boxes = []
                for loc, enc in zip(locations, encodings):
                    label = "Unknown"
                    sublabel = "Not registered"
                    color = (28, 28, 185)  # Crimson for Unknown

                    if known_encodings:
                        distances = face_recognition.face_distance(known_encodings, enc)
                        best_idx = int(np.argmin(distances))
                        best_dist = float(distances[best_idx])

                        if best_dist <= CONFIG.match_tolerance:
                            matched = known_users[best_idx]
                            confidence = max(0.0, min(1.0, 1.0 - best_dist))
                            user_id = int(matched["user_id"])
                            label = f"{matched['name']} ({confidence * 100:.1f}%)"
                            color = (22, 163, 74)  # Emerald for Verified

                            prev_seen = local_cooldown.get(user_id, 0.0)
                            if now - prev_seen >= cooldown_sec:
                                if direct_db:
                                    status, _ = backend.log_attendance(user_id, confidence)
                                else:
                                    result = backend.post_recognition_sample(enc, CONFIG.match_tolerance)
                                    status = result.get("status", "marked")
                                local_cooldown[user_id] = now
                                sublabel = (
                                    "Attendance logged"
                                    if status == "marked"
                                    else "Already checked in"
                                )
                            else:
                                sublabel = "Recently verified"

                    cached_boxes.append((loc, label, sublabel, color))

            process_frame = not process_frame

            for (top, right, bottom, left), label, sublabel, color in cached_boxes:
                top *= 4
                right *= 4
                bottom *= 4
                left *= 4
                cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
                cv2.rectangle(frame, (left, bottom - 48), (right, bottom), color, cv2.FILLED)
                cv2.putText(
                    frame,
                    label,
                    (left + 8, bottom - 24),
                    cv2.FONT_HERSHEY_DUPLEX,
                    0.58,
                    (255, 255, 255),
                    1,
                )
                cv2.putText(
                    frame,
                    sublabel,
                    (left + 8, bottom - 6),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (240, 240, 240),
                    1,
                )

            cv2.imshow("VeriFace Live Recognition", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("r"):
                known_users = backend.fetch_known_users()
                known_encodings = [u["encoding"] for u in known_users]
                last_refresh = time.time()
                print(f"[VeriFace] Reloaded {len(known_users)} profiles.")
    finally:
        cap.release()
        cv2.destroyAllWindows()

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Real-time face recognition attendance engine")
    parser.add_argument(
        "--direct-db",
        action="store_true",
        help="Log attendance directly to MySQL instead of calling Express REST API",
    )
    parser.add_argument(
        "--refresh",
        type=int,
        default=30,
        help="Seconds between refreshing known encodings",
    )
    args = parser.parse_args()
    return run_recognition(direct_db=args.direct_db, refresh_seconds=args.refresh)


if __name__ == "__main__":
    sys.exit(main())
