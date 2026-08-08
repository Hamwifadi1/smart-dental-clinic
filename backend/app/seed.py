from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Clinic, Doctor, FAQItem, Service, User
from app.security import ROLE_ADMIN_DOCTOR, ROLE_DOCTOR, hash_password


def get_or_create_clinic(db: Session) -> Clinic:
    clinic = db.scalar(select(Clinic).where(Clinic.name == "Chaam Dental Centre"))
    if clinic:
        return clinic

    clinic = Clinic(
        name="Chaam Dental Centre",
        address="Cottbus, Germany",
        phone="+49 000 000000",
        email="info@chaam-dental.com",
        opening_hours={
            "monday": "09:00-17:00",
            "tuesday": "09:00-17:00",
            "wednesday": "09:00-17:00",
            "thursday": "09:00-17:00",
            "friday": "09:00-15:00",
            "saturday": "closed",
            "sunday": "closed",
        },
    )
    db.add(clinic)
    db.flush()
    return clinic


def seed_admin_user(db: Session, clinic: Clinic) -> None:
    lead_doctor = db.scalar(select(Doctor).where(Doctor.clinic_id == clinic.id, Doctor.name == "Dr. Anna Weber"))
    implant_doctor = db.scalar(select(Doctor).where(Doctor.clinic_id == clinic.id, Doctor.name == "Dr. Michael Schmidt"))
    exists = db.scalar(select(User).where(User.email == "admin@chaam-dental.com"))
    if exists:
        exists.doctor_id = lead_doctor.id if lead_doctor else exists.doctor_id
        exists.role = ROLE_ADMIN_DOCTOR
        if exists.password_hash == "change-this-password-hash-in-step-auth":
            exists.password_hash = hash_password("admin123")
    else:
        db.add(
            User(
                clinic_id=clinic.id,
                doctor_id=lead_doctor.id if lead_doctor else None,
                name="Clinic Admin",
                email="admin@chaam-dental.com",
                password_hash=hash_password("admin123"),
                role=ROLE_ADMIN_DOCTOR,
            )
        )

    doctor_logins = [
        (lead_doctor, "Dr. Anna Weber", "anna@chaam-dental.com", "doctor123"),
        (implant_doctor, "Dr. Michael Schmidt", "michael@chaam-dental.com", "doctor123"),
    ]

    for doctor, name, email, password in doctor_logins:
        if doctor is None:
            continue

        doctor_user = db.scalar(select(User).where(User.email == email))
        if doctor_user:
            doctor_user.clinic_id = clinic.id
            doctor_user.doctor_id = doctor.id
            doctor_user.name = name
            doctor_user.password_hash = hash_password(password)
            doctor_user.role = ROLE_DOCTOR
            continue

        db.add(
            User(
                clinic_id=clinic.id,
                doctor_id=doctor.id,
                name=name,
                email=email,
                password_hash=hash_password(password),
                role=ROLE_DOCTOR,
            )
        )


def seed_services(db: Session, clinic: Clinic) -> None:
    services = [
        ("Dental Cleaning", 30),
        ("Dental Filling", 45),
        ("Root Canal Consultation", 60),
        ("Teeth Whitening", 60),
        ("Implant Consultation", 60),
        ("Emergency Consultation", 30),
    ]

    for name, duration_minutes in services:
        exists = db.scalar(
            select(Service).where(Service.clinic_id == clinic.id, Service.name == name)
        )
        if exists:
            continue

        db.add(
            Service(
                clinic_id=clinic.id,
                name=name,
                description=f"{name} service at Chaam Dental Centre.",
                duration_minutes=duration_minutes,
                active=True,
            )
        )


def seed_doctors(db: Session, clinic: Clinic) -> None:
    doctors = [
        ("Dr. Anna Weber", "General Dentist", "anna@chaam-dental.com", "+49 000 000001"),
        ("Dr. Michael Schmidt", "Implant Specialist", "michael@chaam-dental.com", "+49 000 000002"),
    ]

    for name, specialization, email, phone in doctors:
        exists = db.scalar(
            select(Doctor).where(Doctor.clinic_id == clinic.id, Doctor.name == name)
        )
        if exists:
            exists.specialization = specialization
            exists.email = email
            exists.phone = phone
            continue

        db.add(
            Doctor(
                clinic_id=clinic.id,
                name=name,
                specialization=specialization,
                email=email,
                phone=phone,
                active=True,
            )
        )


def seed_faqs(db: Session, clinic: Clinic) -> None:
    faqs = [
        (
            "What are your working hours?",
            "Our clinic is open Monday to Thursday from 09:00 to 17:00 and Friday from 09:00 to 15:00. We are closed on weekends.",
            ["working hours", "hours", "opening"],
        ),
        (
            "How much do treatments cost?",
            "Prices depend on the treatment and your individual needs. Please book a consultation or contact the clinic for an exact estimate.",
            ["prices", "cost", "fees"],
        ),
        (
            "Do you offer emergency appointments?",
            "Yes. For severe pain, swelling, bleeding, trauma, or fever, please call the clinic directly. If symptoms are serious or life-threatening, contact emergency services.",
            ["emergency", "pain", "urgent"],
        ),
        (
            "Where is the clinic located?",
            "Chaam Dental Centre is located in Cottbus, Germany.",
            ["location", "address", "directions"],
        ),
        (
            "How can I book an appointment?",
            "You can book an appointment online by choosing a service, doctor, date, and time, then entering your contact details.",
            ["booking", "appointment", "schedule"],
        ),
        (
            "What payment methods do you accept?",
            "We accept common payment methods at the clinic. Please contact us if you need details about a specific payment method.",
            ["payment", "methods", "cash", "card"],
        ),
    ]

    for question, answer, tags in faqs:
        exists = db.scalar(
            select(FAQItem).where(FAQItem.clinic_id == clinic.id, FAQItem.question == question)
        )
        if exists:
            continue

        db.add(
            FAQItem(
                clinic_id=clinic.id,
                question=question,
                answer=answer,
                tags=tags,
                active=True,
            )
        )


def run_seed() -> None:
    with SessionLocal() as db:
        clinic = get_or_create_clinic(db)
        seed_services(db, clinic)
        seed_doctors(db, clinic)
        db.flush()
        seed_admin_user(db, clinic)
        seed_faqs(db, clinic)
        db.commit()
        print("Seed data loaded for Chaam Dental Centre.")


if __name__ == "__main__":
    run_seed()
