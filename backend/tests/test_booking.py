from collections.abc import Generator
from datetime import date, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.booking import generate_available_slots
from app.database import get_db
from app.main import app
from app.models import Base, BlockedSlot, Clinic, Doctor, Service


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


def test_available_slot_generation(db_session: Session) -> None:
    slots = generate_available_slots(
        db_session,
        doctor_id=1,
        service_id=1,
        day=date(2030, 1, 7),
    )

    assert len(slots) == 18
    assert slots[0] == {"start_time": time(9, 0), "end_time": time(9, 30)}
    assert slots[-1] == {"start_time": time(17, 30), "end_time": time(18, 0)}


def test_preventing_double_booking(client: TestClient) -> None:
    payload = {
        "doctor_id": 1,
        "service_id": 1,
        "appointment_date": "2030-01-07",
        "start_time": "09:00:00",
        "patient_name": "Jane Patient",
        "patient_email": "jane@example.com",
        "patient_phone": "+49 123456",
    }

    first_response = client.post("/api/appointments", json=payload)
    second_response = client.post("/api/appointments", json=payload)

    assert first_response.status_code == 201
    assert first_response.json()["status"] == "pending"
    assert second_response.status_code == 400
    assert second_response.json()["detail"] == "Selected slot is not available."


def test_get_appointment_by_id(client: TestClient) -> None:
    create_response = client.post(
        "/api/appointments",
        json={
            "doctor_id": 1,
            "service_id": 1,
            "appointment_date": "2030-01-07",
            "start_time": "10:00:00",
            "patient_name": "Jane Patient",
            "patient_email": "jane@example.com",
            "patient_phone": "+49 123456",
        },
    )

    appointment_id = create_response.json()["id"]
    get_response = client.get(f"/api/appointments/{appointment_id}")

    assert create_response.status_code == 201
    assert get_response.status_code == 200
    assert get_response.json()["id"] == appointment_id
    assert get_response.json()["patient_email"] == "jane@example.com"


def test_list_all_appointments(client: TestClient) -> None:
    appointments = [
        ("Jane Patient", "10:00:00"),
        ("John Patient", "10:30:00"),
    ]

    for patient_name, start_time in appointments:
        response = client.post(
            "/api/appointments",
            json={
                "doctor_id": 1,
                "service_id": 1,
                "appointment_date": "2030-01-07",
                "start_time": start_time,
                "patient_name": patient_name,
                "patient_email": f"{patient_name.split()[0].lower()}@example.com",
                "patient_phone": "+49 123456",
            },
        )
        assert response.status_code == 201

    list_response = client.get("/api/appointments")

    assert list_response.status_code == 200
    names = [appointment["patient_name"] for appointment in list_response.json()]
    assert names == ["Jane Patient", "John Patient"]


def test_list_appointments_by_patient_name(client: TestClient) -> None:
    appointments = [
        ("Jane Patient", "10:00:00"),
        ("John Patient", "10:30:00"),
    ]

    for patient_name, start_time in appointments:
        response = client.post(
            "/api/appointments",
            json={
                "doctor_id": 1,
                "service_id": 1,
                "appointment_date": "2030-01-07",
                "start_time": start_time,
                "patient_name": patient_name,
                "patient_email": f"{patient_name.split()[0].lower()}@example.com",
                "patient_phone": "+49 123456",
            },
        )
        assert response.status_code == 201

    list_response = client.get("/api/appointments", params={"patient_name": "jane"})

    assert list_response.status_code == 200
    appointments_response = list_response.json()
    assert len(appointments_response) == 1
    assert appointments_response[0]["patient_name"] == "Jane Patient"


def test_get_missing_appointment_returns_404(client: TestClient) -> None:
    response = client.get("/api/appointments/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Appointment not found."


def test_preventing_weekend_booking(client: TestClient) -> None:
    response = client.post(
        "/api/appointments",
        json={
            "doctor_id": 1,
            "service_id": 1,
            "appointment_date": "2030-01-05",
            "start_time": "09:00:00",
            "patient_name": "Weekend Patient",
            "patient_email": "weekend@example.com",
            "patient_phone": "+49 123456",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Selected slot is not available."


def test_preventing_past_booking(client: TestClient) -> None:
    response = client.post(
        "/api/appointments",
        json={
            "doctor_id": 1,
            "service_id": 1,
            "appointment_date": "2020-01-06",
            "start_time": "09:00:00",
            "patient_name": "Past Patient",
            "patient_email": "past@example.com",
            "patient_phone": "+49 123456",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Selected slot is not available."


def test_excluding_blocked_slots(client: TestClient, db_session: Session) -> None:
    db_session.add(
        BlockedSlot(
            doctor_id=1,
            date=date(2030, 1, 7),
            start_time=time(9, 0),
            end_time=time(10, 0),
            reason="Team meeting",
        )
    )
    db_session.commit()

    response = client.get(
        "/api/availability",
        params={"doctor_id": 1, "service_id": 1, "date": "2030-01-07"},
    )

    assert response.status_code == 200
    slots = response.json()
    assert {"start_time": "09:00:00", "end_time": "09:30:00"} not in slots
    assert {"start_time": "09:30:00", "end_time": "10:00:00"} not in slots
    assert {"start_time": "10:00:00", "end_time": "10:30:00"} in slots
