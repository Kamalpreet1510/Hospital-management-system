from __future__ import annotations

import hashlib
import hmac
import html
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterator

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = Path(os.getenv("HMS_DATABASE", BASE_DIR / "hospital.db"))
COOKIE_NAME = "hms_session"
SESSION_DAYS = 7
SLOT_TIMES = ("09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30")
DEPARTMENTS = (
    ("Cardiology", "Heart and cardiovascular care", "heart"),
    ("Neurology", "Brain and nervous system", "brain"),
    ("Orthopedics", "Bone and joint care", "bone"),
    ("Pediatrics", "Care for infants and children", "child"),
    ("Dermatology", "Skin, hair and nail care", "spark"),
    ("General Medicine", "Primary and preventive care", "cross"),
    ("Gynecology", "Women's health and wellness", "flower"),
)

app = FastAPI(title="Hospital Management System", version="1.0.0")


class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    phone: str = Field(default="", max_length=30)
    date_of_birth: str = Field(default="", max_length=10)


class LoginInput(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class BookingInput(BaseModel):
    doctor_id: int
    department_id: int
    appointment_date: str
    appointment_time: str
    reason: str = Field(default="", max_length=500)


class AppointmentUpdate(BaseModel):
    status: str | None = None
    appointment_date: str | None = None
    appointment_time: str | None = None


class DoctorInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(default="Welcome123!", min_length=8, max_length=128)
    phone: str = Field(default="", max_length=30)
    department_id: int
    specialization: str = Field(min_length=2, max_length=100)
    qualification: str = Field(default="", max_length=160)
    experience_years: int = Field(default=0, ge=0, le=70)
    consultation_fee: float = Field(default=80, ge=0, le=100000)


class DoctorEdit(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(default="", max_length=30)
    department_id: int
    specialization: str = Field(min_length=2, max_length=100)
    qualification: str = Field(default="", max_length=160)
    experience_years: int = Field(default=0, ge=0, le=70)
    consultation_fee: float = Field(default=80, ge=0, le=100000)


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(default="", max_length=30)
    address: str = Field(default="", max_length=240)
    date_of_birth: str = Field(default="", max_length=10)


class RecordInput(BaseModel):
    appointment_id: int
    diagnosis: str = Field(min_length=2, max_length=300)
    notes: str = Field(default="", max_length=2000)
    lab_report: str = Field(default="", max_length=500)
    prescription: str = Field(default="", max_length=2000)
    follow_up_date: str = Field(default="", max_length=10)


class DepartmentInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=240)


class BillInput(BaseModel):
    appointment_id: int
    additional_charges: float = Field(default=0, ge=0, le=1000000)
    description: str = Field(default="Consultation", max_length=240)


class PaymentInput(BaseModel):
    payment_method: str = Field(default="Cash", max_length=40)


def connect_db() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def database() -> Iterator[sqlite3.Connection]:
    connection = connect_db()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260_000)
    return f"{salt.hex()}:{digest.hex()}"


def password_matches(password: str, encoded: str) -> bool:
    salt_hex, digest_hex = encoded.split(":", 1)
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 260_000)
    return hmac.compare_digest(actual.hex(), digest_hex)


def initialize_database() -> None:
    schema = """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'doctor', 'patient')),
        phone TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        date_of_birth TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        description TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'cross',
        active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS doctors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
        department_id INTEGER NOT NULL REFERENCES departments(id),
        specialization TEXT NOT NULL,
        qualification TEXT NOT NULL DEFAULT '',
        experience_years INTEGER NOT NULL DEFAULT 0,
        consultation_fee REAL NOT NULL DEFAULT 80
    );
    CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL REFERENCES patients(id),
        doctor_id INTEGER NOT NULL REFERENCES doctors(id),
        department_id INTEGER NOT NULL REFERENCES departments(id),
        appointment_date TEXT NOT NULL,
        appointment_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'completed', 'cancelled')),
        reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS appointment_schedule ON appointments(doctor_id, appointment_date, appointment_time, status);
    CREATE UNIQUE INDEX IF NOT EXISTS unique_active_appointment_slot
        ON appointments(doctor_id, appointment_date, appointment_time) WHERE status != 'cancelled';
    CREATE TABLE IF NOT EXISTS medical_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id),
        patient_id INTEGER NOT NULL REFERENCES patients(id),
        doctor_id INTEGER NOT NULL REFERENCES doctors(id),
        diagnosis TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        lab_report TEXT NOT NULL DEFAULT '',
        follow_up_date TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS prescriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id INTEGER NOT NULL UNIQUE REFERENCES medical_records(id),
        details TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id),
        patient_id INTEGER NOT NULL REFERENCES patients(id),
        consultation_fee REAL NOT NULL,
        additional_charges REAL NOT NULL DEFAULT 0,
        description TEXT NOT NULL DEFAULT 'Consultation',
        total_amount REAL NOT NULL,
        payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'paid')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER NOT NULL REFERENCES bills(id),
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_completed_payment_per_bill
        ON payments(bill_id) WHERE status = 'completed';
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        expires_at INTEGER NOT NULL
    );
    """
    with database() as connection:
        connection.executescript(schema)
        for name, description, icon in DEPARTMENTS:
            connection.execute(
                "INSERT OR IGNORE INTO departments(name, description, icon) VALUES (?, ?, ?)",
                (name, description, icon),
            )
        samples = (
            ("Avery Morgan", "admin@hospital.demo", "admin", "", "", "", 0),
            ("Dr. Maya Chen", "doctor@hospital.demo", "doctor", "", "Cardiology", "MBBS, MD", 12),
            ("Jordan Rivera", "patient@hospital.demo", "patient", "555-0104", "", "", 0),
        )
        for name, email, role, phone, specialty, qualification, experience in samples:
            exists = connection.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if exists:
                continue
            cursor = connection.execute(
                "INSERT INTO users(name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)",
                (name, email, password_hash("Welcome123!"), role, phone),
            )
            if role == "doctor":
                dept = connection.execute("SELECT id FROM departments WHERE name = ?", (specialty,)).fetchone()
                connection.execute(
                    "INSERT INTO doctors(user_id, department_id, specialization, qualification, experience_years, consultation_fee) VALUES (?, ?, ?, ?, ?, ?)",
                    (cursor.lastrowid, dept["id"], specialty, qualification, experience, 120),
                )
            elif role == "patient":
                connection.execute("INSERT INTO patients(user_id) VALUES (?)", (cursor.lastrowid,))


initialize_database()


def public_user(row: sqlite3.Row) -> dict[str, Any]:
    user = {key: row[key] for key in ("id", "name", "email", "role", "phone", "address", "date_of_birth")}
    if row["role"] == "patient":
        user["patient_id"] = row["patient_id"]
    if row["role"] == "doctor":
        user.update(
            doctor_id=row["doctor_id"],
            department_id=row["department_id"],
            department=row["department"],
            specialization=row["specialization"],
            qualification=row["qualification"],
            experience_years=row["experience_years"],
            consultation_fee=row["consultation_fee"],
        )
    return user


def find_user(connection: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
    return connection.execute(
        """SELECT u.*, p.id AS patient_id, d.id AS doctor_id, d.department_id, dep.name AS department,
                  d.specialization, d.qualification, d.experience_years, d.consultation_fee
           FROM users u LEFT JOIN patients p ON p.user_id = u.id
           LEFT JOIN doctors d ON d.user_id = u.id LEFT JOIN departments dep ON dep.id = d.department_id
           WHERE u.id = ? AND u.active = 1""",
        (user_id,),
    ).fetchone()


def current_user(request: Request) -> dict[str, Any]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Please sign in to continue.")
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with database() as connection:
        session = connection.execute(
            "SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?",
            (token_hash, int(time.time())),
        ).fetchone()
        row = find_user(connection, session["user_id"]) if session else None
        if row is None:
            raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
        return public_user(row)


def role_required(user: dict[str, Any], *roles: str) -> dict[str, Any]:
    if user["role"] not in roles:
        raise HTTPException(status_code=403, detail="You do not have permission to access this feature.")
    return user


def valid_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Enter a valid date in YYYY-MM-DD format.") from None


def normalized_email(value: str) -> str:
    email = value.strip().lower()
    if "@" not in email or "." not in email.rsplit("@", 1)[-1] or any(char.isspace() for char in email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return email


def patient_id_for_user(connection: sqlite3.Connection, user: dict[str, Any]) -> int:
    if user["role"] == "patient":
        return user["patient_id"]
    raise HTTPException(status_code=400, detail="A patient account is required.")


def appointment_query() -> str:
    return """SELECT a.*, puser.name AS patient_name, puser.email AS patient_email, puser.phone AS patient_phone,
                     duser.name AS doctor_name, duser.email AS doctor_email, dep.name AS department,
                     doc.specialization, doc.consultation_fee
              FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN users puser ON puser.id = p.user_id
              JOIN doctors doc ON doc.id = a.doctor_id JOIN users duser ON duser.id = doc.user_id
              JOIN departments dep ON dep.id = a.department_id"""


@app.get("/", response_class=HTMLResponse)
def home() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


@app.get("/styles.css")
def styles() -> FileResponse:
    return FileResponse(BASE_DIR / "styles.css", media_type="text/css")


@app.get("/app.js")
def frontend_script() -> FileResponse:
    return FileResponse(BASE_DIR / "app.js", media_type="text/javascript")


@app.get("/favicon.svg", include_in_schema=False)
@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> FileResponse:
    return FileResponse(BASE_DIR / "favicon.svg", media_type="image/svg+xml")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "database": "sqlite"}


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterInput, response: Response) -> dict[str, Any]:
    email = normalized_email(payload.email)
    if payload.date_of_birth:
        valid_date(payload.date_of_birth)
    with database() as connection:
        try:
            cursor = connection.execute(
                "INSERT INTO users(name, email, password_hash, role, phone, date_of_birth) VALUES (?, ?, ?, 'patient', ?, ?)",
                (payload.name.strip(), email, password_hash(payload.password), payload.phone.strip(), payload.date_of_birth),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="An account with this email already exists.") from None
        connection.execute("INSERT INTO patients(user_id) VALUES (?)", (cursor.lastrowid,))
        user = public_user(find_user(connection, cursor.lastrowid))
        create_session(connection, response, cursor.lastrowid)
    return {"user": user}


def create_session(connection: sqlite3.Connection, response: Response, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    expires = int(time.time()) + SESSION_DAYS * 24 * 60 * 60
    connection.execute(
        "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hashlib.sha256(token.encode()).hexdigest(), user_id, expires),
    )
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=os.getenv("HMS_COOKIE_SECURE", "0") == "1",
        samesite="strict",
        path="/",
    )


@app.post("/api/auth/login")
def login(payload: LoginInput, response: Response) -> dict[str, Any]:
    with database() as connection:
        row = connection.execute("SELECT id, password_hash FROM users WHERE email = ? AND active = 1", (payload.email.strip(),)).fetchone()
        if not row or not password_matches(payload.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Email or password is incorrect.")
        create_session(connection, response, row["id"])
        return {"user": public_user(find_user(connection, row["id"]))}


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request) -> Response:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        with database() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),))
    response = Response(status_code=204)
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="strict")
    return response


@app.get("/api/session")
def session(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"user": user}


@app.get("/api/departments")
def departments(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    with database() as connection:
        return [dict(row) for row in connection.execute("SELECT * FROM departments WHERE active = 1 ORDER BY name")]


@app.post("/api/departments", status_code=201)
def create_department(payload: DepartmentInput, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    role_required(user, "admin")
    with database() as connection:
        try:
            cursor = connection.execute("INSERT INTO departments(name, description) VALUES (?, ?)", (payload.name.strip(), payload.description.strip()))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="That department already exists.") from None
        return dict(connection.execute("SELECT * FROM departments WHERE id = ?", (cursor.lastrowid,)).fetchone())


@app.patch("/api/departments/{department_id}")
def update_department(department_id: int, payload: DepartmentInput, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    role_required(user, "admin")
    with database() as connection:
        try:
            cursor = connection.execute("UPDATE departments SET name = ?, description = ? WHERE id = ? AND active = 1", (payload.name.strip(), payload.description.strip(), department_id))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="That department already exists.") from None
        if not cursor.rowcount:
            raise HTTPException(status_code=404, detail="Department not found.")
        return dict(connection.execute("SELECT * FROM departments WHERE id = ?", (department_id,)).fetchone())


@app.delete("/api/departments/{department_id}", status_code=204)
def delete_department(department_id: int, user: dict[str, Any] = Depends(current_user)) -> Response:
    role_required(user, "admin")
    with database() as connection:
        cursor = connection.execute("UPDATE departments SET active = 0 WHERE id = ? AND active = 1", (department_id,))
        if not cursor.rowcount:
            raise HTTPException(status_code=404, detail="Department not found.")
    return Response(status_code=204)


@app.get("/api/doctors")
def doctors(department_id: int | None = None, search: str = "", user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    query = """SELECT d.id AS doctor_id, u.id AS user_id, u.name, u.email, u.phone, d.department_id,
                     dep.name AS department, d.specialization, d.qualification, d.experience_years,
                     d.consultation_fee FROM doctors d JOIN users u ON u.id = d.user_id
              JOIN departments dep ON dep.id = d.department_id WHERE u.active = 1 AND dep.active = 1"""
    params: list[Any] = []
    if department_id:
        query += " AND d.department_id = ?"
        params.append(department_id)
    if search.strip():
        query += " AND (u.name LIKE ? OR d.specialization LIKE ? OR dep.name LIKE ?)"
        params.extend([f"%{search.strip()}%"] * 3)
    query += " ORDER BY u.name"
    with database() as connection:
        return [dict(row) for row in connection.execute(query, params)]


@app.post("/api/doctors", status_code=201)
def create_doctor(payload: DoctorInput, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    role_required(user, "admin")
    email = normalized_email(payload.email)
    with database() as connection:
        dept = connection.execute("SELECT id FROM departments WHERE id = ? AND active = 1", (payload.department_id,)).fetchone()
        if not dept:
            raise HTTPException(status_code=422, detail="Choose an active department.")
        try:
            cursor = connection.execute(
                "INSERT INTO users(name, email, password_hash, role, phone) VALUES (?, ?, ?, 'doctor', ?)",
                (payload.name.strip(), email, password_hash(payload.password), payload.phone.strip()),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="An account with this email already exists.") from None
        doctor_cursor = connection.execute(
            "INSERT INTO doctors(user_id, department_id, specialization, qualification, experience_years, consultation_fee) VALUES (?, ?, ?, ?, ?, ?)",
            (cursor.lastrowid, payload.department_id, payload.specialization.strip(), payload.qualification.strip(), payload.experience_years, payload.consultation_fee),
        )
        return {
            "doctor_id": doctor_cursor.lastrowid,
            "name": payload.name.strip(),
            "email": email,
            "specialization": payload.specialization.strip(),
            "department_id": payload.department_id,
        }


@app.patch("/api/doctors/{doctor_id}")
def update_doctor(doctor_id: int, payload: DoctorEdit, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    role_required(user, "admin")
    with database() as connection:
        dept = connection.execute("SELECT id FROM departments WHERE id = ? AND active = 1", (payload.department_id,)).fetchone()
        if not dept:
            raise HTTPException(status_code=422, detail="Choose an active department.")
        row = connection.execute("SELECT user_id FROM doctors WHERE id = ?", (doctor_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Doctor not found.")
        connection.execute("UPDATE users SET name = ?, phone = ? WHERE id = ?", (payload.name.strip(), payload.phone.strip(), row["user_id"]))
        connection.execute("UPDATE doctors SET department_id = ?, specialization = ?, qualification = ?, experience_years = ?, consultation_fee = ? WHERE id = ?", (payload.department_id, payload.specialization.strip(), payload.qualification.strip(), payload.experience_years, payload.consultation_fee, doctor_id))
        return {"doctor_id": doctor_id, "name": payload.name.strip(), "specialization": payload.specialization.strip()}


@app.delete("/api/doctors/{doctor_id}", status_code=204)
def delete_doctor(doctor_id: int, user: dict[str, Any] = Depends(current_user)) -> Response:
    role_required(user, "admin")
    with database() as connection:
        doctor = connection.execute("SELECT user_id FROM doctors WHERE id = ?", (doctor_id,)).fetchone()
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found.")
        connection.execute("UPDATE users SET active = 0 WHERE id = ?", (doctor["user_id"],))
        connection.execute("DELETE FROM sessions WHERE user_id = ?", (doctor["user_id"],))
    return Response(status_code=204)


@app.get("/api/doctors/{doctor_id}/availability")
def availability(doctor_id: int, appointment_date: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    valid_date(appointment_date)
    with database() as connection:
        doctor = connection.execute("SELECT d.id FROM doctors d JOIN users u ON u.id=d.user_id WHERE d.id=? AND u.active=1", (doctor_id,)).fetchone()
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found.")
        booked = {row["appointment_time"] for row in connection.execute("SELECT appointment_time FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status != 'cancelled'", (doctor_id, appointment_date))}
    is_today = appointment_date == date.today().isoformat()
    current_time = datetime.now().strftime("%H:%M")
    return {"date": appointment_date, "slots": [{"time": slot, "available": slot not in booked and (not is_today or slot > current_time)} for slot in SLOT_TIMES]}


@app.get("/api/appointments")
def appointments(status_filter: str = "", search: str = "", user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    query = appointment_query()
    params: list[Any] = []
    if user["role"] == "patient":
        query += " WHERE a.patient_id = ?"
        params.append(user["patient_id"])
    elif user["role"] == "doctor":
        query += " WHERE a.doctor_id = ?"
        params.append(user["doctor_id"])
    else:
        query += " WHERE 1 = 1"
    if status_filter:
        query += " AND a.status = ?"
        params.append(status_filter)
    if search.strip():
        query += " AND (puser.name LIKE ? OR duser.name LIKE ? OR dep.name LIKE ?)"
        params.extend([f"%{search.strip()}%"] * 3)
    query += " ORDER BY a.appointment_date DESC, a.appointment_time DESC"
    with database() as connection:
        return [dict(row) for row in connection.execute(query, params)]


@app.post("/api/appointments", status_code=201)
def book_appointment(payload: BookingInput, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    role_required(user, "patient")
    appointment_day = valid_date(payload.appointment_date)
    if appointment_day < date.today():
        raise HTTPException(status_code=422, detail="Choose a date that has not passed.")
    if appointment_day == date.today() and payload.appointment_time <= datetime.now().strftime("%H:%M"):
        raise HTTPException(status_code=422, detail="Choose a time that has not passed.")
    if payload.appointment_time not in SLOT_TIMES:
        raise HTTPException(status_code=422, detail="Choose an available appointment time.")
    with database() as connection:
        doctor = connection.execute("SELECT d.id, d.department_id FROM doctors d JOIN users u ON u.id=d.user_id WHERE d.id=? AND u.active=1", (payload.doctor_id,)).fetchone()
        if not doctor or doctor["department_id"] != payload.department_id:
            raise HTTPException(status_code=422, detail="Choose a doctor in the selected department.")
        connection.execute("BEGIN IMMEDIATE")
        taken = connection.execute("SELECT id FROM appointments WHERE doctor_id=? AND appointment_date=? AND appointment_time=? AND status!='cancelled'", (payload.doctor_id, payload.appointment_date, payload.appointment_time)).fetchone()
        if taken:
            raise HTTPException(status_code=409, detail="That appointment time has just been booked. Choose another slot.")
        try:
            cursor = connection.execute("INSERT INTO appointments(patient_id, doctor_id, department_id, appointment_date, appointment_time, reason) VALUES (?, ?, ?, ?, ?, ?)", (patient_id_for_user(connection, user), payload.doctor_id, payload.department_id, payload.appointment_date, payload.appointment_time, payload.reason.strip()))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="That appointment time has just been booked. Choose another slot.") from None
        row = connection.execute(appointment_query() + " WHERE a.id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)


@app.patch("/api/appointments/{appointment_id}")
def update_appointment(appointment_id: int, payload: AppointmentUpdate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    allowed = {"pending", "confirmed", "completed", "cancelled"}
    with database() as connection:
        row = connection.execute("SELECT * FROM appointments WHERE id = ?", (appointment_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Appointment not found.")
        if user["role"] == "patient":
            if row["patient_id"] != user["patient_id"] or row["status"] in {"completed", "cancelled"}:
                raise HTTPException(status_code=403, detail="This appointment can no longer be changed.")
            if payload.status not in (None, "cancelled"):
                raise HTTPException(status_code=403, detail="Patients can only cancel an appointment.")
        elif user["role"] == "doctor":
            if row["doctor_id"] != user["doctor_id"]:
                raise HTTPException(status_code=403, detail="This appointment is assigned to another doctor.")
            if payload.status not in (None, "confirmed", "completed", "cancelled"):
                raise HTTPException(status_code=422, detail="Invalid appointment status.")
        elif user["role"] != "admin":
            raise HTTPException(status_code=403, detail="You do not have permission to update appointments.")
        new_status = payload.status or row["status"]
        if new_status not in allowed:
            raise HTTPException(status_code=422, detail="Invalid appointment status.")
        new_date = payload.appointment_date or row["appointment_date"]
        new_time = payload.appointment_time or row["appointment_time"]
        if payload.appointment_date or payload.appointment_time:
            if user["role"] not in {"patient", "admin"}:
                raise HTTPException(status_code=403, detail="Only patients and admins can reschedule.")
            valid_date(new_date)
            if date.fromisoformat(new_date) < date.today() or new_time not in SLOT_TIMES:
                raise HTTPException(status_code=422, detail="Choose a future date and a valid time slot.")
            if new_date == date.today().isoformat() and new_time <= datetime.now().strftime("%H:%M"):
                raise HTTPException(status_code=422, detail="Choose a time that has not passed.")
            conflict = connection.execute("SELECT id FROM appointments WHERE doctor_id=? AND appointment_date=? AND appointment_time=? AND status!='cancelled' AND id!=?", (row["doctor_id"], new_date, new_time, appointment_id)).fetchone()
            if conflict:
                raise HTTPException(status_code=409, detail="That appointment time is already booked.")
        if new_status != "cancelled":
            conflict = connection.execute("SELECT id FROM appointments WHERE doctor_id=? AND appointment_date=? AND appointment_time=? AND status!='cancelled' AND id!=?", (row["doctor_id"], new_date, new_time, appointment_id)).fetchone()
            if conflict:
                raise HTTPException(status_code=409, detail="That appointment time is already booked.")
        try:
            connection.execute("UPDATE appointments SET status=?, appointment_date=?, appointment_time=? WHERE id=?", (new_status, new_date, new_time, appointment_id))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="That appointment time is already booked.") from None
        updated = connection.execute(appointment_query() + " WHERE a.id=?", (appointment_id,)).fetchone()
        return dict(updated)


@app.get("/api/patients")
def patients(search: str = "", user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    role_required(user, "admin", "doctor")
    query = """SELECT p.id AS patient_id, u.id AS user_id, u.name, u.email, u.phone, u.address, u.date_of_birth,
                     COUNT(DISTINCT a.id) AS appointment_count FROM patients p JOIN users u ON u.id=p.user_id
              LEFT JOIN appointments a ON a.patient_id=p.id WHERE u.active=1"""
    params: list[Any] = []
    if user["role"] == "doctor":
        query += " AND EXISTS(SELECT 1 FROM appointments ax WHERE ax.patient_id=p.id AND ax.doctor_id=?)"
        params.append(user["doctor_id"])
    if search.strip():
        query += " AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)"
        params.extend([f"%{search.strip()}%"] * 3)
    query += " GROUP BY p.id ORDER BY u.name"
    with database() as connection:
        return [dict(row) for row in connection.execute(query, params)]


@app.patch("/api/patients/{patient_id}")
def update_patient(patient_id: int, payload: ProfileUpdate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    role_required(user, "admin")
    with database() as connection:
        row = connection.execute("SELECT user_id FROM patients WHERE id=?", (patient_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Patient not found.")
        connection.execute("UPDATE users SET name=?, phone=?, address=?, date_of_birth=? WHERE id=?", (payload.name.strip(), payload.phone.strip(), payload.address.strip(), payload.date_of_birth, row["user_id"]))
        return {"patient_id": patient_id, "name": payload.name.strip()}


@app.delete("/api/patients/{patient_id}", status_code=204)
def delete_patient(patient_id: int, user: dict[str, Any] = Depends(current_user)) -> Response:
    role_required(user, "admin")
    with database() as connection:
        row = connection.execute("SELECT user_id FROM patients WHERE id=?", (patient_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Patient not found.")
        connection.execute("UPDATE users SET active=0 WHERE id=?", (row["user_id"],))
        connection.execute("DELETE FROM sessions WHERE user_id=?", (row["user_id"],))
    return Response(status_code=204)


@app.get("/api/records")
def records(search: str = "", user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    query = """SELECT r.*, puser.name AS patient_name, duser.name AS doctor_name,
                     a.appointment_date, a.appointment_time, dep.name AS department,
                     rx.details AS prescription FROM medical_records r
              JOIN patients p ON p.id=r.patient_id JOIN users puser ON puser.id=p.user_id
              JOIN doctors d ON d.id=r.doctor_id JOIN users duser ON duser.id=d.user_id
              JOIN appointments a ON a.id=r.appointment_id JOIN departments dep ON dep.id=a.department_id
              LEFT JOIN prescriptions rx ON rx.record_id=r.id WHERE 1=1"""
    params: list[Any] = []
    if user["role"] == "patient":
        query += " AND r.patient_id=?"
        params.append(user["patient_id"])
    elif user["role"] == "doctor":
        query += " AND r.doctor_id=?"
        params.append(user["doctor_id"])
    if search.strip():
        query += " AND (puser.name LIKE ? OR r.diagnosis LIKE ? OR duser.name LIKE ?)"
        params.extend([f"%{search.strip()}%"] * 3)
    query += " ORDER BY r.created_at DESC"
    with database() as connection:
        return [dict(row) for row in connection.execute(query, params)]


@app.post("/api/records", status_code=201)
def create_record(payload: RecordInput, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    role_required(user, "doctor", "admin")
    with database() as connection:
        appointment = connection.execute("SELECT * FROM appointments WHERE id=?", (payload.appointment_id,)).fetchone()
        if not appointment or appointment["status"] == "cancelled":
            raise HTTPException(status_code=404, detail="A valid appointment is required for a patient record.")
        if user["role"] == "doctor" and appointment["doctor_id"] != user["doctor_id"]:
            raise HTTPException(status_code=403, detail="You can only write records for your own patients.")
        if payload.follow_up_date:
            valid_date(payload.follow_up_date)
        cursor = connection.execute("""INSERT INTO medical_records(appointment_id, patient_id, doctor_id, diagnosis, notes, lab_report, follow_up_date)
                                       VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(appointment_id) DO UPDATE SET diagnosis=excluded.diagnosis,
                                       notes=excluded.notes, lab_report=excluded.lab_report, follow_up_date=excluded.follow_up_date""",
                                   (payload.appointment_id, appointment["patient_id"], appointment["doctor_id"], payload.diagnosis.strip(), payload.notes.strip(), payload.lab_report.strip(), payload.follow_up_date))
        record = connection.execute("SELECT id FROM medical_records WHERE appointment_id=?", (payload.appointment_id,)).fetchone()
        connection.execute("INSERT INTO prescriptions(record_id, details) VALUES (?, ?) ON CONFLICT(record_id) DO UPDATE SET details=excluded.details", (record["id"], payload.prescription.strip()))
        connection.execute("UPDATE appointments SET status='completed' WHERE id=?", (payload.appointment_id,))
        return {"record_id": record["id"], "patient_id": appointment["patient_id"], "diagnosis": payload.diagnosis.strip()}


@app.get("/api/bills")
def bills(search: str = "", user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    query = """SELECT b.*, puser.name AS patient_name, puser.email AS patient_email,
                     duser.name AS doctor_name, dep.name AS department, a.appointment_date,
                     a.appointment_time FROM bills b JOIN patients p ON p.id=b.patient_id
              JOIN users puser ON puser.id=p.user_id JOIN appointments a ON a.id=b.appointment_id
              JOIN doctors d ON d.id=a.doctor_id JOIN users duser ON duser.id=d.user_id
              JOIN departments dep ON dep.id=a.department_id WHERE 1=1"""
    params: list[Any] = []
    if user["role"] == "patient":
        query += " AND b.patient_id=?"
        params.append(user["patient_id"])
    elif user["role"] == "doctor":
        query += " AND a.doctor_id=?"
        params.append(user["doctor_id"])
    if search.strip():
        query += " AND (puser.name LIKE ? OR duser.name LIKE ?)"
        params.extend([f"%{search.strip()}%"] * 2)
    query += " ORDER BY b.created_at DESC"
    with database() as connection:
        return [dict(row) for row in connection.execute(query, params)]


@app.post("/api/bills", status_code=201)
def create_bill(payload: BillInput, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    role_required(user, "admin")
    with database() as connection:
        appointment = connection.execute("SELECT a.patient_id, d.consultation_fee FROM appointments a JOIN doctors d ON d.id=a.doctor_id WHERE a.id=? AND a.status!='cancelled'", (payload.appointment_id,)).fetchone()
        if not appointment:
            raise HTTPException(status_code=404, detail="A valid appointment is required for a bill.")
        total = round(appointment["consultation_fee"] + payload.additional_charges, 2)
        try:
            cursor = connection.execute("INSERT INTO bills(appointment_id, patient_id, consultation_fee, additional_charges, description, total_amount) VALUES (?, ?, ?, ?, ?, ?)", (payload.appointment_id, appointment["patient_id"], appointment["consultation_fee"], payload.additional_charges, payload.description.strip(), total))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="A bill already exists for this appointment.") from None
        return {"bill_id": cursor.lastrowid, "total_amount": total, "payment_status": "unpaid"}


@app.post("/api/bills/{bill_id}/payments", status_code=201)
def pay_bill(bill_id: int, payload: PaymentInput, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if user["role"] not in {"patient", "admin"}:
        raise HTTPException(status_code=403, detail="Only patients and admins can record payments.")
    with database() as connection:
        connection.execute("BEGIN IMMEDIATE")
        bill = connection.execute("SELECT * FROM bills WHERE id=?", (bill_id,)).fetchone()
        if not bill:
            raise HTTPException(status_code=404, detail="Bill not found.")
        if user["role"] == "patient" and bill["patient_id"] != user["patient_id"]:
            raise HTTPException(status_code=403, detail="This bill belongs to another patient.")
        if bill["payment_status"] == "paid":
            raise HTTPException(status_code=409, detail="This bill has already been paid.")
        if payload.payment_method not in {"Cash", "Card", "Insurance", "Bank transfer"}:
            raise HTTPException(status_code=422, detail="Choose a valid payment method.")
        try:
            cursor = connection.execute("INSERT INTO payments(bill_id, amount, payment_method) VALUES (?, ?, ?)", (bill_id, bill["total_amount"], payload.payment_method))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="This bill has already been paid.") from None
        connection.execute("UPDATE bills SET payment_status='paid' WHERE id=?", (bill_id,))
        return {"payment_id": cursor.lastrowid, "bill_id": bill_id, "amount": bill["total_amount"], "status": "completed"}


@app.get("/api/bills/{bill_id}/invoice", response_class=HTMLResponse)
def invoice(bill_id: int, user: dict[str, Any] = Depends(current_user)) -> HTMLResponse:
    with database() as connection:
        bill = connection.execute(
            """SELECT b.*, puser.name AS patient_name, puser.email AS patient_email,
                      puser.address AS patient_address, duser.name AS doctor_name,
                      dep.name AS department, a.appointment_date, a.appointment_time
               FROM bills b JOIN patients p ON p.id=b.patient_id JOIN users puser ON puser.id=p.user_id
               JOIN appointments a ON a.id=b.appointment_id JOIN doctors d ON d.id=a.doctor_id
               JOIN users duser ON duser.id=d.user_id JOIN departments dep ON dep.id=a.department_id
               WHERE b.id=?""",
            (bill_id,),
        ).fetchone()
        if not bill:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        if user["role"] == "patient" and bill["patient_id"] != user["patient_id"]:
            raise HTTPException(status_code=403, detail="This invoice belongs to another patient.")
        if user["role"] == "doctor":
            assigned = connection.execute("SELECT doctor_id FROM appointments WHERE id=?", (bill["appointment_id"],)).fetchone()
            if not assigned or assigned["doctor_id"] != user["doctor_id"]:
                raise HTTPException(status_code=403, detail="This invoice is assigned to another doctor.")
        payment = connection.execute("SELECT payment_method, paid_at FROM payments WHERE bill_id=? ORDER BY id DESC LIMIT 1", (bill_id,)).fetchone()
    esc = html.escape
    paid_details = f"<p>Payment method: {esc(payment['payment_method'])}<br>Paid on: {esc(payment['paid_at'])}</p>" if payment else "<p>Payment has not been recorded.</p>"
    document = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice NH-{bill_id:05d}</title>
    <style>body{{margin:0;padding:40px;background:#f6f8f5;color:#202c2a;font:14px 'Segoe UI',sans-serif}}main{{max-width:760px;margin:24px auto;padding:48px;background:white;border:1px solid #e8ede8}}header,footer,.total{{display:flex;justify-content:space-between;gap:20px}}header{{padding-bottom:24px;border-bottom:2px solid #337a5a}}h1{{font:36px Georgia,serif}}h2{{margin:28px 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#76827d}}p{{line-height:1.7;color:#56635c}}table{{width:100%;margin:26px 0;border-collapse:collapse;text-align:left}}td,th{{padding:13px;border-bottom:1px solid #e8ede8}}th{{color:#76827d;font-size:11px}}.total{{padding:16px 13px;background:#e9f2eb;font-weight:bold}}button{{padding:10px 17px;border:0;border-radius:5px;color:white;background:#337a5a;cursor:pointer}}@media print{{body{{padding:0;background:white}}main{{margin:0 auto;padding:25px;border:0}}.print{{display:none}}}}</style></head><body><main>
    <header><div><strong>✚ Northstar Health</strong><p>Patient billing statement</p></div><div><h1>Invoice</h1><p>NH-{bill_id:05d}<br>{esc(bill['created_at'][:10])}</p></div></header>
    <h2>Bill to</h2><p><strong>{esc(bill['patient_name'])}</strong><br>{esc(bill['patient_email'])}<br>{esc(bill['patient_address'] or '')}</p>
    <h2>Care details</h2><p>{esc(bill['doctor_name'])} · {esc(bill['department'])}<br>{esc(bill['appointment_date'])} at {esc(bill['appointment_time'])}</p>
    <table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody><tr><td>{esc(bill['description'])} · consultation</td><td>${bill['consultation_fee']:.2f}</td></tr><tr><td>Additional charges</td><td>${bill['additional_charges']:.2f}</td></tr></tbody></table>
    <div class="total"><span>Total due</span><span>${bill['total_amount']:.2f}</span></div><h2>Payment status: {esc(bill['payment_status'].title())}</h2>{paid_details}<footer><p>Thank you for choosing Northstar Health.</p><button class="print" onclick="window.print()">Print invoice</button></footer></main></body></html>"""
    return HTMLResponse(document)


@app.get("/api/reports")
def reports(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    role_required(user, "admin")
    with database() as connection:
        summary = connection.execute("""SELECT (SELECT COUNT(*) FROM users WHERE role='patient' AND active=1) AS patients,
                  (SELECT COUNT(*) FROM users WHERE role='doctor' AND active=1) AS doctors,
                  (SELECT COUNT(*) FROM appointments) AS appointments,
                  (SELECT COALESCE(SUM(total_amount),0) FROM bills WHERE payment_status='paid') AS revenue,
                  (SELECT COUNT(*) FROM appointments WHERE status='pending') AS pending,
                  (SELECT COUNT(*) FROM bills WHERE payment_status='unpaid') AS outstanding""").fetchone()
        monthly = connection.execute("SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count FROM appointments WHERE created_at >= date('now','-5 months') GROUP BY month ORDER BY month").fetchall()
        by_department = connection.execute("SELECT dep.name, COUNT(a.id) AS count FROM departments dep LEFT JOIN appointments a ON a.department_id=dep.id GROUP BY dep.id ORDER BY count DESC, dep.name").fetchall()
        return {"summary": dict(summary), "monthly_appointments": [dict(row) for row in monthly], "departments": [dict(row) for row in by_department]}


@app.get("/api/dashboard")
def dashboard(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    with database() as connection:
        if user["role"] == "admin":
            counts = connection.execute("""SELECT (SELECT COUNT(*) FROM users WHERE role='patient' AND active=1) AS patients,
                (SELECT COUNT(*) FROM users WHERE role='doctor' AND active=1) AS doctors,
                (SELECT COUNT(*) FROM appointments) AS appointments,
                (SELECT COUNT(*) FROM appointments WHERE appointment_date>=date('now') AND status!='cancelled') AS upcoming,
                (SELECT COALESCE(SUM(total_amount),0) FROM bills WHERE payment_status='paid') AS revenue""").fetchone()
            appt_query = appointment_query() + " ORDER BY a.appointment_date, a.appointment_time LIMIT 6"
            next_appointments = [dict(row) for row in connection.execute(appt_query)]
            return {"stats": dict(counts), "appointments": next_appointments}
        if user["role"] == "doctor":
            counts = connection.execute("""SELECT (SELECT COUNT(*) FROM appointments WHERE doctor_id=? AND appointment_date>=date('now') AND status IN ('pending','confirmed')) AS upcoming,
                (SELECT COUNT(DISTINCT patient_id) FROM appointments WHERE doctor_id=?) AS patients,
                (SELECT COUNT(*) FROM appointments WHERE doctor_id=? AND status='completed') AS completed""", (user["doctor_id"], user["doctor_id"], user["doctor_id"])).fetchone()
            upcoming = [dict(row) for row in connection.execute(appointment_query() + " WHERE a.doctor_id=? AND a.appointment_date>=date('now') AND a.status IN ('pending','confirmed') ORDER BY a.appointment_date,a.appointment_time LIMIT 6", (user["doctor_id"],))]
            today_appointments = [dict(row) for row in connection.execute(appointment_query() + " WHERE a.doctor_id=? AND a.appointment_date=date('now') AND a.status IN ('pending','confirmed') ORDER BY a.appointment_time LIMIT 6", (user["doctor_id"],))]
            return {"stats": dict(counts), "appointments": upcoming, "today_appointments": today_appointments}
        counts = connection.execute("""SELECT (SELECT COUNT(*) FROM appointments WHERE patient_id=? AND appointment_date>=date('now') AND status IN ('pending','confirmed')) AS upcoming,
            (SELECT COUNT(*) FROM medical_records WHERE patient_id=?) AS records,
            (SELECT COUNT(*) FROM bills WHERE patient_id=? AND payment_status='unpaid') AS unpaid""", (user["patient_id"], user["patient_id"], user["patient_id"])).fetchone()
        upcoming = [dict(row) for row in connection.execute(appointment_query() + " WHERE a.patient_id=? ORDER BY a.appointment_date DESC,a.appointment_time DESC LIMIT 6", (user["patient_id"],))]
        return {"stats": dict(counts), "appointments": upcoming}


@app.get("/api/profile")
def get_profile(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"user": user}


@app.patch("/api/profile")
def update_profile(payload: ProfileUpdate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if payload.date_of_birth:
        valid_date(payload.date_of_birth)
    with database() as connection:
        connection.execute("UPDATE users SET name=?, phone=?, address=?, date_of_birth=? WHERE id=?", (payload.name.strip(), payload.phone.strip(), payload.address.strip(), payload.date_of_birth, user["id"]))
        return {"user": public_user(find_user(connection, user["id"]))}


@app.get("/api/patients/{patient_id}/history")
def patient_history(patient_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    role_required(user, "admin", "doctor", "patient")
    with database() as connection:
        if user["role"] == "patient" and user["patient_id"] != patient_id:
            raise HTTPException(status_code=403, detail="You can only view your own history.")
        if user["role"] == "doctor" and not connection.execute("SELECT 1 FROM appointments WHERE patient_id=? AND doctor_id=?", (patient_id, user["doctor_id"])).fetchone():
            raise HTTPException(status_code=403, detail="You can only view history for your own patients.")
    return {"appointments": appointments_for_patient(patient_id), "records": records_for_patient(patient_id)}


def appointments_for_patient(patient_id: int) -> list[dict[str, Any]]:
    with database() as connection:
        return [dict(row) for row in connection.execute(appointment_query() + " WHERE a.patient_id=? ORDER BY a.appointment_date DESC", (patient_id,))]


def records_for_patient(patient_id: int) -> list[dict[str, Any]]:
    with database() as connection:
        return [dict(row) for row in connection.execute("SELECT r.*, rx.details AS prescription FROM medical_records r LEFT JOIN prescriptions rx ON rx.record_id=r.id WHERE r.patient_id=? ORDER BY r.created_at DESC", (patient_id,))]
