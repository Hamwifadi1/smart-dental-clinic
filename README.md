# Smart Dental Clinic

This project presents a full-stack smart clinic system designed to improve how patients interact with a dental clinic and how clinic staff manage daily operations. The platform combines a conversational assistant, appointment scheduling, treatment and payment records, and role-based administration in one application.

The central idea was not simply to build a chatbot interface, but to design a reliable workflow around a real healthcare use case. A patient can ask for clinic information, describe an urgent situation, start a booking conversation, choose an available doctor and time, and later check the appointment status. On the operational side, doctors, administrators, and secretaries receive tools adapted to their responsibilities.

## Problem Definition

Dental clinics often handle repetitive questions, appointment requests, schedule conflicts, and patient records through separate manual processes. This creates unnecessary work for staff and makes the patient experience slower.

The system was designed around three questions:

- How can a conversational interface turn a patient request into a structured action?
- How can appointment availability remain accurate while accounting for service duration, working hours, existing bookings, and blocked time?
- How can automation support a healthcare workflow without giving unsafe medical advice?

## Conversational Assistant

The assistant uses an interpretable, rule-based intent detection pipeline. User messages are normalized and classified into intents such as:

- Greeting
- Appointment booking
- Appointment status
- Services and treatments
- Prices
- Working hours
- Clinic location
- Emergency guidance

The response is not always a fixed message. The detected intent determines the next action and may retrieve live information from the database, including services, doctors, FAQ answers, appointment details, and available time slots.

Example interaction:

```text
Patient: I want to book an appointment.
Assistant: Which dental service do you need?
Patient selects a service.
Assistant: Which doctor would you prefer?
Patient selects a doctor and date.
Assistant: Here are the available time slots.
```

Conversation state is passed between turns so that an unstructured request becomes a structured booking containing the service, doctor, date, time, and patient contact details.

## Why an Interpretable Approach?

For the current version, I intentionally used deterministic intent rules instead of connecting an external large language model. This keeps the system:

- Explainable: every detected intent can be traced to a defined rule.
- Predictable: healthcare-related responses do not change randomly.
- Testable: important conversation paths can be validated with automated tests.
- Cost-efficient: the application does not depend on a paid AI API.
- Privacy-conscious: patient messages are not sent to an external AI provider.

This architecture also creates a clear path toward a future hybrid system, where an NLP or LLM layer can improve language understanding while deterministic rules continue to control booking actions and medical safety boundaries.

## Healthcare Safety Logic

The assistant does not diagnose medical conditions. Messages containing urgent indicators such as severe pain, swelling, bleeding, trauma, fever, or infection are prioritized before normal intent handling.

Instead of generating a diagnosis, the system returns a consistent safety response and directs the patient to contact the clinic or emergency services. This separation between informational support and medical decision-making was an important design requirement.

## Appointment Scheduling Logic

Available time slots are generated dynamically rather than stored as static options. The scheduling algorithm considers:

- Clinic working hours
- The selected service duration
- Active doctors and services
- Existing pending and confirmed appointments
- Doctor blocked-time intervals
- Weekend restrictions
- Past dates and times
- Overlapping appointment intervals

This prevents double booking and ensures that the chatbot and the public booking form use the same scheduling rules.

## Role-Based Clinic Workflow

The platform includes separate operational views for different clinic roles:

### Administrator

- Manage appointments, doctors, services, FAQs, and blocked slots
- Filter appointments and update their status
- Create and deactivate doctor accounts

### Doctor

- Access only assigned appointments
- Update appointment status and notes
- Manage personal blocked time

### Secretary

- Create and update treatment records
- Track treatment prices, paid amounts, and remaining balances
- Filter records by doctor, patient, and date

Authentication uses signed access tokens, salted PBKDF2 password hashing, and backend authorization checks rather than relying only on frontend visibility.

## System Architecture

```text
React + Tailwind CSS
        |
        | REST API
        v
FastAPI Application
  |-- Intent Detection & Conversation State
  |-- Booking and Availability Engine
  |-- Role-Based Authorization
  |-- Clinic Management Services
        |
        v
SQLAlchemy + PostgreSQL
```

## Technologies

- **Frontend:** React 19, Vite, Tailwind CSS, Lucide React
- **Backend:** Python, FastAPI, Pydantic, SQLAlchemy
- **Database:** PostgreSQL, Alembic migrations
- **Authentication:** Signed tokens, PBKDF2 password hashing, role-based authorization
- **Testing:** Pytest, HTTPX, FastAPI TestClient
- **Notifications:** SMTP with a local console fallback

## Testing and Validation

The backend contains 46 automated tests covering the main business and safety rules, including:

- Intent detection and FAQ retrieval
- Emergency-message prioritization
- Multi-step booking conversations
- Appointment-status lookup
- Available-slot generation
- Double-booking prevention
- Weekend and past-date rejection
- Blocked-slot exclusion
- Authentication and role permissions
- Treatment-record operations

Current validation result:

```text
46 passed
```

The React production build was also validated successfully with Vite.

## Project Structure

```text
backend/
  alembic/          Database migrations
  app/              API, models, chatbot, booking, and security logic
  tests/            Automated backend tests

frontend/
  src/              React interface and API client
```

## Run Locally

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
createdb -U postgres dental_clinic_chatbot
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.seed
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8001
```

API documentation is available at `http://127.0.0.1:8001/docs`.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@chaam-dental.com` | `admin123` |
| Doctor | `anna@chaam-dental.com` | `doctor123` |

These credentials are intended only for local demonstration. The seeded passwords and `JWT_SECRET_KEY` must be changed before deployment.

## Future AI Development

The next development stage would introduce a hybrid conversational AI architecture:

- Train or evaluate an intent-classification model against a labelled conversation dataset.
- Use retrieval-augmented generation for clinic knowledge while keeping answers grounded in approved content.
- Add multilingual understanding for English, German, and Arabic patient messages.
- Measure intent accuracy, fallback rate, task-completion rate, and booking conversion.
- Keep deterministic guardrails for emergency escalation, authorization, and transactional actions.

The goal would not be to replace the reliable workflow with unrestricted generation, but to improve language understanding while preserving explainability, safety, and control.

## Conclusion

This project demonstrates how I approach an AI-oriented software problem from end to end: defining the real user workflow, separating conversational understanding from business actions, designing explicit safety boundaries, connecting responses to live data, and validating critical behavior with automated tests.

The result is a working smart clinic platform that demonstrates skills in:

- Conversational system design
- Interpretable intent detection
- Stateful workflow automation
- Healthcare-aware safety thinking
- Backend and database architecture
- Role-based security
- Full-stack development
- Automated testing

## Author

Developed by [Fadi Hamwi](https://github.com/Hamwifadi1).
