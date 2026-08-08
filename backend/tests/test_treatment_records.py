from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import app
from app.models import Base, Clinic, Doctor, Service


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

        db.add_all(
            [
                Doctor(
                    clinic_id=clinic.id,
                    name="Dr. Anna Weber",
                    specialization="General Dentist",
                    active=True,
                ),
                Service(
                    clinic_id=clinic.id,
                    name="Dental Cleaning",
                    description="Dental Cleaning service.",
                    duration_minutes=30,
                    price_min=100,
                    price_max=120,
                    active=True,
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


def treatment_payload() -> dict:
    return {
        "patient_name": "Jane Patient",
        "patient_phone": "+49 123456",
        "service_id": 1,
        "doctor_id": 1,
        "base_price": "100.00",
        "paid_amount": "40.00",
        "treatment_datetime": "2030-01-07T09:30:00",
        "notes": "Cleaning completed.",
    }


def test_create_treatment_record_calculates_remaining_amount(client: TestClient) -> None:
    response = client.post("/api/secretary/treatment-records", json=treatment_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["patient_name"] == "Jane Patient"
    assert body["service_name"] == "Dental Cleaning"
    assert body["doctor_name"] == "Dr. Anna Weber"
    assert body["remaining_amount"] == "60.00"


def test_update_treatment_record_and_mark_paid(client: TestClient) -> None:
    create_response = client.post("/api/secretary/treatment-records", json=treatment_payload())
    record_id = create_response.json()["id"]

    update_response = client.patch(
        f"/api/secretary/treatment-records/{record_id}",
        json={
            "patient_name": "Jane Updated",
            "paid_amount": "100.00",
            "treatment_datetime": "2030-01-07T11:00:00",
            "notes": "Paid in full.",
        },
    )

    assert update_response.status_code == 200
    body = update_response.json()
    assert body["patient_name"] == "Jane Updated"
    assert body["paid_amount"] == "100.00"
    assert body["remaining_amount"] == "0.00"
    assert body["notes"] == "Paid in full."


def test_delete_treatment_record(client: TestClient) -> None:
    create_response = client.post("/api/secretary/treatment-records", json=treatment_payload())
    record_id = create_response.json()["id"]

    delete_response = client.delete(f"/api/secretary/treatment-records/{record_id}")
    list_response = client.get("/api/secretary/treatment-records")

    assert delete_response.status_code == 204
    assert list_response.json() == []


def test_record_survives_deleted_doctor_and_service(client: TestClient, db_session: Session) -> None:
    create_response = client.post("/api/secretary/treatment-records", json=treatment_payload())
    record_id = create_response.json()["id"]

    doctor = db_session.get(Doctor, 1)
    service = db_session.get(Service, 1)
    db_session.delete(doctor)
    db_session.delete(service)
    db_session.commit()

    list_response = client.get("/api/secretary/treatment-records")
    record = list_response.json()[0]

    assert record["id"] == record_id
    assert record["doctor_id"] == 1
    assert record["doctor_name"] == "Dr. Anna Weber"
    assert record["service_id"] == 1
    assert record["service_name"] == "Dental Cleaning"

    paid_response = client.patch(
        f"/api/secretary/treatment-records/{record_id}",
        json={"paid_amount": record["base_price"]},
    )

    assert paid_response.status_code == 200
    assert paid_response.json()["remaining_amount"] == "0.00"


def test_rejects_overpayment(client: TestClient) -> None:
    payload = treatment_payload()
    payload["paid_amount"] = "120.00"

    response = client.post("/api/secretary/treatment-records", json=payload)

    assert response.status_code == 422
