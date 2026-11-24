"""Configuration loader for the VeriFace Python Face Recognition Engine."""
import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class EngineConfig:
    mysql_host: str = os.getenv("MYSQL_HOST", "localhost")
    mysql_port: int = int(os.getenv("MYSQL_PORT", "3306"))
    mysql_user: str = os.getenv("MYSQL_USER", "root")
    mysql_password: str = os.getenv("MYSQL_PASSWORD", "")
    mysql_database: str = os.getenv("MYSQL_DATABASE", "face_attendance_db")

    backend_api_url: str = os.getenv("BACKEND_API_URL", "http://localhost:3000")
    engine_api_key: str = os.getenv("FACE_ENGINE_API_KEY", "")

    camera_index: int = int(os.getenv("CAMERA_INDEX", "0"))
    match_tolerance: float = float(os.getenv("MATCH_TOLERANCE", "0.55"))
    duplicate_window_minutes: int = int(os.getenv("DUPLICATE_WINDOW_MINUTES", "10"))
    late_after_time: str = os.getenv("LATE_AFTER_TIME", "09:15:00")
    detection_model: str = os.getenv("FACE_DETECTION_MODEL", "hog")  # "hog" (CPU) or "cnn" (GPU)


CONFIG = EngineConfig()
