-- =============================================================================
-- VeriFace Attendance System — MySQL 8.0 Schema
-- =============================================================================

CREATE DATABASE IF NOT EXISTS face_attendance_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE face_attendance_db;

-- 1. Administrators
CREATE TABLE IF NOT EXISTS admins (
  admin_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Departments / Classes
CREATE TABLE IF NOT EXISTS departments (
  department_id INT AUTO_INCREMENT PRIMARY KEY,
  department_name VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Registered Users & 128-D Facial Encodings
-- face_encoding stores a JSON array or packed 128 x float64 BLOB (1024 bytes)
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  roll_no VARCHAR(64) NOT NULL UNIQUE,
  department_id INT NOT NULL,
  role ENUM('Student', 'Faculty', 'Staff', 'Intern') NOT NULL DEFAULT 'Student',
  face_encoding LONGBLOB NOT NULL,
  avatar_url VARCHAR(512) NULL,
  registered_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_department
    FOREIGN KEY (department_id) REFERENCES departments(department_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  INDEX idx_users_department (department_id),
  INDEX idx_users_roll_no (roll_no)
) ENGINE=InnoDB;

-- 4. Attendance Logs
CREATE TABLE IF NOT EXISTS attendance (
  attendance_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  date DATE NOT NULL,
  time_in TIME NOT NULL,
  status ENUM('Present', 'Late', 'Absent') NOT NULL DEFAULT 'Present',
  confidence_score DECIMAL(5,4) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attendance_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  INDEX idx_attendance_date (date),
  INDEX idx_attendance_user_date (user_id, date, time_in)
) ENGINE=InnoDB;

-- Seed baseline departments
INSERT IGNORE INTO departments (department_name) VALUES
  ('Computer Science'),
  ('Electrical Engineering'),
  ('Data Science'),
  ('Operations'),
  ('Faculty & Staff');
