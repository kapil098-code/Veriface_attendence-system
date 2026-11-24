"""Multi-frame webcam face registration script (OpenCV + dlib face_recognition)."""
from __future__ import annotations

import argparse
import sys
import time
from typing import List

import cv2
import face_recognition
import numpy as np

from config import CONFIG
from db import ExpressBridgeClient, MySQLStore


def capture_face_encoding(camera_index: int, samples: int = 5) -> np.ndarray:
    """Capture multiple clear single-face frames and average their 128-d encodings."""
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError(f"Unable to open camera index {camera_index}")

    collected: List[np.ndarray] = []
    last_capture = 0.0

    print(f"[VeriFace] Looking for a single face. Capturing {samples} frames...")
    print("[VeriFace] Press 'c' to force-capture or 'q' to cancel.")

    try:
        while len(collected) < samples:
            ok, frame = cap.read()
            if not ok:
                continue

            small = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
            rgb_small = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
            locations = face_recognition.face_locations(rgb_small, model=CONFIG.detection_model)

            display = frame.copy()
            now = time.time()

            if len(locations) == 1:
                top, right, bottom, left = [v * 2 for v in locations[0]]
                cv2.rectangle(display, (left, top), (right, bottom), (29, 78, 216), 2)

                if now - last_capture >= 0.45:
                    encodings = face_recognition.face_encodings(rgb_small, locations)
                    if encodings:
                        collected.append(encodings[0])
                        last_capture = now
                        print(f"[VeriFace] Captured sample {len(collected)}/{samples}")
            elif len(locations) > 1:
                cv2.putText(
                    display,
                    "Multiple faces detected - keep only 1 person in frame",
                    (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 0, 220),
                    2,
                )
            else:
                cv2.putText(
                    display,
                    "No face detected - look directly at camera",
                    (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 140, 255),
                    2,
                )

            cv2.putText(
                display,
                f"Samples: {len(collected)}/{samples}",
                (20, display.shape[0] - 20),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (255, 255, 255),
                2,
            )
            cv2.imshow("VeriFace Registration", display)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                raise KeyboardInterrupt("Registration cancelled by user")
    finally:
        cap.release()
        cv2.destroyAllWindows()

    centroid = np.mean(np.vstack(collected), axis=0)
    norm = np.linalg.norm(centroid)
    return centroid / norm if norm > 0 else centroid


def main() -> int:
    parser = argparse.ArgumentParser(description="Register a user face encoding")
    parser.add_argument("--name", required=True, help="Full name")
    parser.add_argument("--roll-no", required=True, help="Roll No or Employee ID")
    parser.add_argument("--department-id", type=int, default=1, help="Department ID")
    parser.add_argument(
        "--role",
        default="Student",
        choices=["Student", "Faculty", "Staff", "Intern"],
        help="Member role",
    )
    parser.add_argument("--samples", type=int, default=5, help="Frames to average")
    parser.add_argument(
        "--direct-db",
        action="store_true",
        help="Write directly to MySQL instead of calling Express REST API",
    )
    args = parser.parse_args()

    encoding = capture_face_encoding(CONFIG.camera_index, samples=args.samples)

    if args.direct_db:
        store = MySQLStore()
        user_id = store.register_user(
            name=args.name,
            roll_no=args.roll_no,
            department_id=args.department_id,
            role=args.role,
            encoding=encoding,
        )
        print(f"[VeriFace] Registered user_id={user_id} directly in MySQL.")
    else:
        client = ExpressBridgeClient()
        res = client.register_user(
            name=args.name,
            roll_no=args.roll_no,
            department_id=args.department_id,
            role=args.role,
            encoding=encoding,
        )
        print(f"[VeriFace] Registered via Express API: {res}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
