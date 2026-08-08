from collections.abc import Generator
from datetime import date, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import app
from app.models import Appointment, Base, Clinic, Doctor, FAQItem, Service


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as db:
        clinic = Clinic(
            name="Chaam Dental Centre",
            address="Cottbus, Germany",
            phone="+49 000 000000",
            email="info@chaam-dental.com",
            opening_hours={},
        )
        db.add(clinic)
        db.flush()

        doctor = Doctor(
            clinic_id=clinic.id,
            name="Dr. Anna Weber",
            specialization="General Dentist",
            active=True,
        )
        service = Service(
            clinic_id=clinic.id,
            name="Dental Cleaning",
            description="Dental Cleaning service.",
            duration_minutes=30,
            active=True,
        )
        db.add_all([doctor, service])
        db.flush()

        db.add_all(
            [
                FAQItem(
                    clinic_id=clinic.id,
                    question="What are your working hours?",
                    answer="We are open Monday to Friday from 09:00 to 18:00.",
                    tags=["working hours", "hours", "opening"],
                    active=True,
                ),
                FAQItem(
                    clinic_id=clinic.id,
                    question="Where is the clinic located?",
                    answer="Chaam Dental Centre is located in Cottbus, Germany.",
                    tags=["location", "address"],
                    active=True,
                ),
                Appointment(
                    clinic_id=clinic.id,
                    doctor_id=doctor.id,
                    service_id=service.id,
                    patient_name="Jane Patient",
                    patient_email="jane@example.com",
                    patient_phone="+49 123456",
                    appointment_date=date(2030, 1, 7),
                    start_time=time(9, 0),
                    end_time=time(9, 30),
                    status="confirmed",
                ),
            ]
        )
        db.commit()
        yield db


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_chatbot_answers_faq(client: TestClient) -> None:
    response = client.post("/api/chat", json={"message": "What are your working hours?"})

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "We are open Monday to Friday from 09:00 to 18:00."
    assert body["intent"] == "ask_working_hours"
    assert body["next_action"] is None
    assert body["data"]["faq_id"] == 1


def test_chatbot_detects_booking_intent(client: TestClient) -> None:
    response = client.post("/api/chat", json={"message": "I want to book an appointment"})

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "booking_request"
    assert body["next_action"] == "ask_service"
    assert "Which dental service" in body["reply"]
    assert body["data"]["services"][0]["name"] == "Dental Cleaning"


def test_chatbot_emergency_safety_response(client: TestClient) -> None:
    response = client.post("/api/chat", json={"message": "I have severe pain and swelling"})

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "ask_emergency"
    assert body["next_action"] == "contact_clinic_or_emergency_services"
    assert body["reply"] == (
        "I’m sorry you’re experiencing this. I cannot provide a medical diagnosis, but this may require urgent care. "
        "Please contact the clinic directly or emergency services if the situation is severe."
    )


def test_chatbot_unknown_question_fallback(client: TestClient) -> None:
    response = client.post("/api/chat", json={"message": "Do you repair bicycles?"})

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "unknown"
    assert body["next_action"] is None
    assert "I do not have an answer" in body["reply"]


def test_chatbot_asks_for_booking_name_when_checking_appointment_status(client: TestClient) -> None:
    response = client.post("/api/chat", json={"message": "Is my appointment confirmed?"})

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "appointment_status"
    assert body["next_action"] == "ask_appointment_patient_name"
    assert "name used for booking" in body["reply"]


def test_chatbot_returns_appointment_status_by_two_part_name(client: TestClient) -> None:
    response = client.post(
        "/api/chat",
        json={
            "message": "Jane Patient",
            "state": {"last_next_action": "ask_appointment_patient_name"},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "appointment_status"
    assert body["next_action"] is None
    assert "Jane Patient" in body["reply"]
    assert "2030-01-07" in body["reply"]
    assert "confirmed" in body["reply"]
    assert body["data"]["appointment"]["status"] == "confirmed"


def test_chatbot_returns_appointment_status_by_exact_single_name(client: TestClient) -> None:
    response = client.post(
        "/api/chat",
        json={
            "message": "Jane",
            "state": {"last_next_action": "ask_appointment_patient_name"},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "appointment_status"
    assert "Jane Patient" in body["reply"]
    assert body["data"]["appointment"]["status"] == "confirmed"


def test_chatbot_does_not_match_partial_name(client: TestClient) -> None:
    response = client.post(
        "/api/chat",
        json={
            "message": "Ja",
            "state": {"last_next_action": "ask_appointment_patient_name"},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "appointment_status"
    assert "could not find an appointment" in body["reply"]
