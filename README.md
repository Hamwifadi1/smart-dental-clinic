# Dental Clinic Chatbot & Booking System

A full-stack clinic management platform that brings patient booking, a rule-based support chatbot, and day-to-day clinic administration into one responsive web application.

Built as a portfolio project with React, FastAPI, PostgreSQL, and role-based authentication.

## Highlights

- Patient-facing clinic website with services and doctor profiles
- Guided appointment booking with availability checks
- Rule-based chatbot for FAQs, booking intent, and emergency guidance
- Secure admin and doctor dashboard with JWT authentication
- Role-based access for clinic administrators and doctors
- Appointment approval, cancellation, completion, filtering, and notes
- Doctor, service, FAQ, and blocked-slot management
- Secretary workspace for treatment records, payments, and balances
- SMTP email notifications with a console fallback for local development
- Database migrations, seed data, and automated backend tests

## Tech Stack

| Area | Technologies |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS, Lucide React |
| Backend | FastAPI, SQLAlchemy, Pydantic, Uvicorn |
| Database | PostgreSQL, Alembic |
| Authentication | JWT-style signed tokens, PBKDF2 password hashing, role-based authorization |
| Testing | Pytest, HTTPX |

## Project Structure

```text
ClinicChatBot/
├── backend/
│   ├── alembic/          # Database migrations
│   ├── app/              # API, models, business logic, and seed data
│   ├── tests/            # Backend test suite
│   └── requirements.txt
├── frontend/
│   ├── src/              # React application and API client
│   └── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL

### 1. Configure and run the backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Create the local database:

```powershell
createdb -U postgres dental_clinic_chatbot
```

Update `backend/.env` if your PostgreSQL connection differs from the example, then run the migrations and seed data:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.seed
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8001
```

The API will be available at `http://127.0.0.1:8001`. Interactive API documentation is available at `http://127.0.0.1:8001/docs`.

### 2. Run the frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173` in your browser.

## Application Routes

| Route | Purpose |
| --- | --- |
| `/` | Public patient website and appointment booking |
| `/admin` | Authenticated admin and doctor dashboard |
| `/secretary` | Treatment records and payment workspace |

## Demo Accounts

The seed command creates local demonstration accounts:

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@chaam-dental.com` | `admin123` |
| Doctor | `anna@chaam-dental.com` | `doctor123` |

> These credentials are for local demonstration only. Change the seeded passwords and `JWT_SECRET_KEY` before deploying the application.

## Environment Variables

Copy `backend/.env.example` to `backend/.env`. The main settings are:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/dental_clinic_chatbot
JWT_SECRET_KEY=replace-with-a-long-random-value
JWT_EXPIRE_MINUTES=120
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_USE_TLS=true
```

The application runs without SMTP credentials; notification messages are printed to the backend console during local development.

## Testing

Run the backend test suite from the `backend` directory:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Build the production frontend bundle from the `frontend` directory:

```powershell
npm run build
```

## API Overview

The FastAPI backend includes endpoints for:

- Public services, doctors, appointment availability, and bookings
- Chatbot messages and conversational booking state
- Authentication and current-user details
- Admin appointment, doctor, service, FAQ, and blocked-slot management
- Secretary treatment records and payment tracking

Explore the complete API and schemas through Swagger UI at `/docs` while the backend is running.

## Security Notes

- `.env`, virtual environments, dependency folders, logs, and production build output are excluded from Git.
- Passwords are stored as salted PBKDF2 hashes.
- Protected API routes enforce role-based authorization.
- The chatbot provides general information and urgent-care guidance; it does not provide medical diagnoses.

## Author

Developed by [Fadi Hamwi](https://github.com/Hamwifadi1).
