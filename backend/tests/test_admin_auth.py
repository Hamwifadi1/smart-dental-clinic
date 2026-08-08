from collections.abc import Generator
from datetime import date, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import app
from app.models import Appointment, Base, Clinic, Doctor, Service, User
from app.security import ROLE_ADMIN_DOCTOR, ROLE_DOCTOR, hash_password


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
            email="anna@chaam-dental.com",
            phone="+49 000 000001",
            active=True,
        )
        other_doctor = Doctor(
            clinic_id=clinic.id,
            name="Dr. Michael Schmidt",
            specialization="Implant Specialist",
            email="michael@chaam-dental.com",
            phone="+49 000 000002",
            active=True,
        )
        service = Service(
            clinic_id=clinic.id,
            name="Dental Cleaning",
            description="Dental Cleaning service.",
            duration_minutes=30,
            active=True,
        )
        admin = User(
            clinic_id=clinic.id,
            name="Clinic Admin",
            email="admin@chaam-dental.com",
            password_hash=hash_password("admin123"),
            role=ROLE_ADMIN_DOCTOR,
        )
        db.add_all([doctor, other_doctor, service])
        db.flush()

        admin.doctor_id = doctor.id
        doctor_user = User(
            clinic_id=clinic.id,
            doctor_id=other_doctor.id,
            name="Dr. Michael Schmidt",
            email="anna@chaam-dental.com",
            password_hash=hash_password("doctor123"),
            role=ROLE_DOCTOR,
        )
        db.add_all([admin, doctor_user])
        db.flush()

        db.add_all([
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
                status="pending",
            ),
            Appointment(
                clinic_id=clinic.id,
                doctor_id=other_doctor.id,
                service_id=service.id,
                patient_name="Other Patient",
                patient_email="other@example.com",
                patient_phone="+49 999999",
                appointment_date=date(2030, 1, 8),
                start_time=time(10, 0),
                end_time=time(10, 30),
                status="pending",
            ),
        ])
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


def test_admin_login_returns_jwt(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@chaam-dental.com", "password": "admin123"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"].count(".") == 2
    assert body["user"]["role"] == ROLE_ADMIN_DOCTOR
    assert body["user"]["doctor_id"] == 1


def test_admin_login_rejects_bad_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@chaam-dental.com", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_admin_appointments_requires_token(client: TestClient) -> None:
    response = client.get("/api/admin/appointments")

    assert response.status_code == 401


def get_admin_token(client: TestClient) -> str:
    login_response = client.post(
        "/api/auth/login",
        json={"email": "admin@chaam-dental.com", "password": "admin123"},
    )
    return login_response.json()["access_token"]


def get_doctor_token(client: TestClient) -> str:
    login_response = client.post(
        "/api/auth/login",
        json={"email": "anna@chaam-dental.com", "password": "doctor123"},
    )
    return login_response.json()["access_token"]


def test_admin_appointments_returns_real_appointments(client: TestClient) -> None:
    token = get_admin_token(client)

    response = client.get(
        "/api/admin/appointments",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    appointments = response.json()
    assert len(appointments) == 2
    assert {appointment["patient_name"] for appointment in appointments} == {"Jane Patient", "Other Patient"}
    assert appointments[0]["status"] == "pending"


def test_doctor_can_list_only_own_appointments(client: TestClient) -> None:
    token = get_doctor_token(client)

    response = client.get(
        "/api/admin/appointments",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    appointments = response.json()
    assert len(appointments) == 1
    assert appointments[0]["patient_name"] == "Other Patient"
    assert appointments[0]["patient_email"] == "other@example.com"
    assert appointments[0]["patient_phone"] == "+49 999999"
    assert appointments[0]["service_name"] == "Dental Cleaning"
    assert appointments[0]["appointment_date"] == "2030-01-08"
    assert appointments[0]["start_time"] == "10:00:00"
    assert appointments[0]["end_time"] == "10:30:00"
    assert appointments[0]["status"] == "pending"
    assert appointments[0]["doctor_id"] == 2


def test_doctor_cannot_access_another_doctors_appointments(client: TestClient) -> None:
    token = get_doctor_token(client)

    response = client.get(
        "/api/admin/appointments",
        params={"doctor_id": 1},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


def test_admin_can_confirm_appointment(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sent_messages = []

    def fake_send_notification(appointment: Appointment, admin_message: str) -> None:
        sent_messages.append((appointment.status, admin_message, appointment.patient_email))

    monkeypatch.setattr("app.api.send_appointment_status_notification", fake_send_notification)
    token = get_admin_token(client)

    response = client.patch(
        "/api/admin/appointments/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "confirmed", "admin_message": "Your appointment is approved."},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"
    assert sent_messages == [("confirmed", "Your appointment is approved.", "jane@example.com")]


def test_admin_doctor_can_approve_any_appointment(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.send_appointment_status_notification", lambda appointment, admin_message: None)
    token = get_admin_token(client)

    response = client.patch(
        "/api/admin/appointments/2",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "confirmed", "admin_message": "Approved."},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"


def test_admin_can_cancel_appointment_with_message(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sent_messages = []

    def fake_send_notification(appointment: Appointment, admin_message: str) -> None:
        sent_messages.append((appointment.status, admin_message, appointment.patient_name))

    monkeypatch.setattr("app.api.send_appointment_status_notification", fake_send_notification)
    token = get_admin_token(client)

    response = client.patch(
        "/api/admin/appointments/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "cancelled", "admin_message": "Please call us to choose another time."},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert sent_messages == [("cancelled", "Please call us to choose another time.", "Jane Patient")]


def test_admin_can_reject_appointment(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sent_messages = []

    def fake_send_notification(appointment: Appointment, admin_message: str) -> None:
        sent_messages.append((appointment.status, admin_message, appointment.patient_name))

    monkeypatch.setattr("app.api.send_appointment_status_notification", fake_send_notification)
    token = get_admin_token(client)

    response = client.patch(
        "/api/admin/appointments/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "rejected", "admin_message": "This time is not available."},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert sent_messages == [("rejected", "This time is not available.", "Jane Patient")]


def test_admin_can_complete_appointment(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.send_appointment_status_notification", lambda appointment, admin_message: None)
    token = get_admin_token(client)

    response = client.patch(
        "/api/admin/appointments/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "completed", "admin_message": "Completed."},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def test_admin_can_delete_appointment(client: TestClient) -> None:
    token = get_admin_token(client)

    delete_response = client.delete(
        "/api/admin/appointments/1",
        headers={"Authorization": f"Bearer {token}"},
    )
    list_response = client.get("/api/admin/appointments", headers={"Authorization": f"Bearer {token}"})

    assert delete_response.status_code == 204
    assert "Jane Patient" not in {appointment["patient_name"] for appointment in list_response.json()}


def test_non_authenticated_user_cannot_update_appointment(client: TestClient) -> None:
    response = client.patch(
        "/api/admin/appointments/1",
        json={"status": "confirmed", "admin_message": "Approved."},
    )

    assert response.status_code == 401


def test_invalid_status_is_rejected(client: TestClient) -> None:
    token = get_admin_token(client)

    response = client.patch(
        "/api/admin/appointments/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "approved", "admin_message": "Approved."},
    )

    assert response.status_code == 422


def test_admin_can_create_update_delete_doctor(client: TestClient) -> None:
    token = get_admin_token(client)

    create_response = client.post(
        "/api/admin/doctors",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Dr. Clara Hoffmann",
            "specialization": "General Dentist",
            "email": "clara@example.com",
            "phone": "+49 333",
            "password": "clara123",
            "active": True,
        },
    )

    assert create_response.status_code == 201
    doctor_id = create_response.json()["id"]
    assert create_response.json()["email"] == "clara@example.com"
    assert create_response.json()["phone"] == "+49 333"

    login_response = client.post(
        "/api/auth/login",
        json={"email": "clara@example.com", "password": "clara123"},
    )

    assert login_response.status_code == 200
    assert login_response.json()["user"]["role"] == ROLE_DOCTOR
    assert login_response.json()["user"]["doctor_id"] == doctor_id

    update_response = client.patch(
        f"/api/admin/doctors/{doctor_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "specialization": "Root Canal Specialist",
            "email": "clara.h@example.com",
            "phone": "+49 444",
            "password": "newclara123",
            "active": True,
        },
    )

    assert update_response.status_code == 200
    assert update_response.json()["specialization"] == "Root Canal Specialist"
    assert update_response.json()["email"] == "clara.h@example.com"
    assert update_response.json()["phone"] == "+49 444"

    updated_login_response = client.post(
        "/api/auth/login",
        json={"email": "clara.h@example.com", "password": "newclara123"},
    )

    assert updated_login_response.status_code == 200
    assert updated_login_response.json()["user"]["doctor_id"] == doctor_id

    delete_response = client.delete(
        f"/api/admin/doctors/{doctor_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    list_response = client.get("/api/admin/doctors", headers={"Authorization": f"Bearer {token}"})
    public_response = client.get("/api/doctors")

    assert delete_response.status_code == 204
    assert "Dr. Clara Hoffmann" not in {doctor["name"] for doctor in list_response.json()}
    assert "Dr. Clara Hoffmann" not in {doctor["name"] for doctor in public_response.json()}


def test_public_doctors_only_return_active_records(client: TestClient) -> None:
    token = get_admin_token(client)
    create_response = client.post(
        "/api/admin/doctors",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Dr. Inactive",
            "specialization": "General Dentist",
            "email": "inactive@example.com",
            "password": "inactive123",
            "active": False,
        },
    )

    assert create_response.status_code == 201

    public_response = client.get("/api/doctors")
    admin_response = client.get("/api/admin/doctors", headers={"Authorization": f"Bearer {token}"})

    assert public_response.status_code == 200
    assert admin_response.status_code == 200
    assert "Dr. Inactive" not in {doctor["name"] for doctor in public_response.json()}
    assert "Dr. Inactive" in {doctor["name"] for doctor in admin_response.json()}


def test_admin_can_update_service_and_public_only_returns_active(client: TestClient) -> None:
    token = get_admin_token(client)

    create_response = client.post(
        "/api/admin/services",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Smile Design",
            "description": "Cosmetic planning.",
            "duration_minutes": 45,
            "price_min": "100.00",
            "price_max": "250.00",
            "active": True,
        },
    )

    assert create_response.status_code == 201
    service_id = create_response.json()["id"]

    update_response = client.patch(
        f"/api/admin/services/{service_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Smile Design Consultation",
            "description": "Updated cosmetic planning.",
            "duration_minutes": 60,
            "price_min": "120.00",
            "price_max": "300.00",
            "active": False,
        },
    )

    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Smile Design Consultation"
    assert update_response.json()["duration_minutes"] == 60
    assert update_response.json()["active"] is False

    public_response = client.get("/api/services")
    admin_response = client.get("/api/admin/services", headers={"Authorization": f"Bearer {token}"})

    assert "Smile Design Consultation" not in {service["name"] for service in public_response.json()}
    assert "Smile Design Consultation" in {service["name"] for service in admin_response.json()}


def test_admin_can_delete_service(client: TestClient) -> None:
    token = get_admin_token(client)
    create_response = client.post(
        "/api/admin/services",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Temporary Service",
            "description": "Temporary.",
            "duration_minutes": 30,
            "active": True,
        },
    )
    service_id = create_response.json()["id"]

    delete_response = client.delete(
        f"/api/admin/services/{service_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    admin_response = client.get("/api/admin/services", headers={"Authorization": f"Bearer {token}"})
    public_response = client.get("/api/services")

    assert delete_response.status_code == 204
    assert "Temporary Service" not in {service["name"] for service in admin_response.json()}
    assert "Temporary Service" not in {service["name"] for service in public_response.json()}


def test_normal_doctor_cannot_manage_doctors(client: TestClient) -> None:
    token = get_doctor_token(client)

    response = client.post(
        "/api/admin/doctors",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Dr. Clara Hoffmann",
            "specialization": "General Dentist",
            "email": "blocked@example.com",
            "password": "blocked123",
            "active": True,
        },
    )

    assert response.status_code == 403


def test_doctor_can_update_own_appointment(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.send_appointment_status_notification", lambda appointment, admin_message: None)
    token = get_doctor_token(client)

    response = client.patch(
        "/api/admin/appointments/2",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "confirmed", "admin_message": "Confirmed by doctor."},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"


def test_doctor_cannot_update_another_doctors_appointment(client: TestClient) -> None:
    token = get_doctor_token(client)

    response = client.patch(
        "/api/admin/appointments/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "confirmed", "admin_message": "Trying to confirm."},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "You can only update appointments assigned to you."


def test_doctor_can_delete_own_appointment(client: TestClient) -> None:
    token = get_doctor_token(client)

    delete_response = client.delete(
        "/api/admin/appointments/2",
        headers={"Authorization": f"Bearer {token}"},
    )
    list_response = client.get("/api/admin/appointments", headers={"Authorization": f"Bearer {token}"})

    assert delete_response.status_code == 204
    assert list_response.json() == []


def test_doctor_cannot_delete_another_doctors_appointment(client: TestClient) -> None:
    token = get_doctor_token(client)

    response = client.delete(
        "/api/admin/appointments/1",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "You can only delete appointments assigned to you."


def test_normal_doctor_cannot_access_management_endpoints(client: TestClient) -> None:
    token = get_doctor_token(client)

    doctors_response = client.get("/api/admin/doctors", headers={"Authorization": f"Bearer {token}"})
    services_response = client.get("/api/admin/services", headers={"Authorization": f"Bearer {token}"})
    faqs_response = client.get("/api/admin/faqs", headers={"Authorization": f"Bearer {token}"})

    assert doctors_response.status_code == 403
    assert services_response.status_code == 403
    assert faqs_response.status_code == 403
