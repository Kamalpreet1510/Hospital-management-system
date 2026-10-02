# Northstar Health | Hospital Management System

A responsive, full-stack hospital management project for patient self-service, doctor workflows, and hospital administration. It uses a FastAPI backend, a SQLite database, and a role-aware browser interface; no separate database server or JavaScript build step is required.

## Requirements

- Python 3.10 or newer
- Internet access for the hosted typeface, icons, and sign-in photograph

## Run locally

From the project directory, create and activate a virtual environment, install the requirements, and start the development server:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The SQLite database `hospital.db` is created and initialized automatically beside `main.py` on the first run. The `HMS_DATABASE` environment variable can point to a different database file.

On macOS or Linux, activate the environment with `source .venv/bin/activate`; the remaining install and startup commands are the same.

## Demo accounts

All demo accounts use `Welcome123!`.

| Role | Email |
| --- | --- |
| Admin | `admin@hospital.demo` |
| Doctor | `doctor@hospital.demo` |
| Patient | `patient@hospital.demo` |

Patient registration is also available from the sign-in page. Do not reuse demo credentials for a real deployment.

## Features

- Patient registration, secure sign-in, profile management, provider search, appointment requests, scheduling and cancellation, personal medical history, prescriptions, invoices, and payment records.
- Doctor scheduling, appointment confirmation, patient histories, clinical notes, diagnoses, prescriptions, lab/report notes, and follow-up dates.
- Admin dashboards, live reports, doctor and patient management, department management, appointment oversight, invoice creation, and payment ledger management.
- Doctor/date availability checks, conflict protection for occupied slots, role-scoped API access, hashed passwords, expiring database-backed sessions, and responsive layouts.
- Printable, access-controlled invoice pages and persisted consultation fees, additional charges, and payment status.

## API and database

FastAPI's interactive API documentation is available at `/docs` while the server is running. All application endpoints are under `/api`. A successful sign-in sets an HTTP-only, same-site session cookie; API access is checked against the authenticated role and, for patient and doctor records, ownership or assignment.

SQLite tables are initialized automatically: `users`, `patients`, `doctors`, `departments`, `appointments`, `medical_records`, `prescriptions`, `bills`, `payments`, and `sessions`. Seeded departments include Cardiology, Neurology, Orthopedics, Pediatrics, Dermatology, General Medicine, and Gynecology.

## Deploy online

1. Push the project to a GitHub repository.
2. In Render, choose **New > Blueprint**, connect the repository, and apply the included `render.yaml`.
3. Wait for the service health check at `/health` to pass, then open the deployed service URL.
4. Change or disable the sample account passwords immediately. The blueprint enables secure cookies and mounts the SQLite database on a persistent disk so records survive service restarts and deployments.

The included Blueprint provisions a persistent disk; this generally requires a paid Render web service. If deploying to another host, use its supported persistent storage for `HMS_DATABASE`, serve the site over HTTPS, and set `HMS_COOKIE_SECURE=1`. An ephemeral filesystem will lose the SQLite database on redeploy.

## Project structure

```text
main.py          FastAPI routes, validation, authentication, and SQLite models/schema
index.html       Application entry point
favicon.svg      Northstar Health browser icon
styles.css       Responsive hospital dashboard and sign-in styles
app.js           Role-aware interface and API client
requirements.txt Python dependencies
render.yaml      Render deployment Blueprint with persistent storage
```

## Important deployment note

This is an educational project foundation, not a production clinical-record system. Use synthetic data only. Before handling real patient information, add a managed database, backups, audit logging, encryption and privacy controls appropriate to your jurisdiction, operational monitoring, and a security review. Payment entries in this project record a payment method and status in the billing ledger; they do not process card details or contact a bank/payment provider.