# VeriFace Attendance — Contactless Face Recognition Attendance System

A production-ready full-stack + computer vision attendance system separating the **Python Face Recognition Engine** (OpenCV + dlib `face_recognition` + NumPy) from the **Node.js / Express REST API**, **MySQL 8.0** database, and **Web Admin Console**.

## Project Structure

```
├── database/
│   └── schema.sql                 # MySQL 8.0 DDL (admins, departments, users, attendance)
├── face_engine/
│   ├── requirements.txt           # opencv-python, face_recognition, numpy, mysql-connector-python
│   ├── config.py                  # Threshold, duplicate window, MySQL & API configuration
│   ├── db.py                      # Parameterized MySQL 8.0 & Express REST API bridge
│   ├── register_face.py           # Multi-frame OpenCV webcam registration -> 128-d encoding
│   └── recognize_attendance.py    # Real-time webcam detection, matching & duplicate prevention
├── frontend/                      # Standalone HTML5 + CSS3 + Vanilla JS client
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── server/
│   ├── auth.ts                    # scrypt password hashing + HMAC-SHA256 Bearer sessions
│   ├── db.ts                      # Dual-mode MySQL 8.0 pool / local relational store
│   └── routes.ts                  # REST API routes, CSV export, reports & recognition endpoint
├── server.ts                      # Express server entry point (port 3000)
└── src/                           # Interactive Web Dashboard & browser 128-d face engine
```

## Quick Start

### 1. MySQL 8.0 Database
```bash
mysql -u root -p < database/schema.sql
```
Configure `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE=face_attendance_db` in `.env` (or leave unset to use the local relational store in preview).

### 2. Node.js + Express Web Backend
```bash
npm install
npm run dev
```
Open `http://localhost:3000` and create the initial administrator account on first launch (or set `ADMIN_EMAIL` and `ADMIN_PASSCODE` in environment variables).

### 3. Python Face Recognition Engine
```bash
cd face_engine
pip install -r requirements.txt

# Register a new user via webcam (averages 5 frames into a 128-d vector)
python register_face.py --name "Arjun Mehta" --roll-no "CS-2026-014" --department-id 1 --role Student

# Start real-time webcam attendance logging (communicates with Express API or --direct-db)
python recognize_attendance.py
```
