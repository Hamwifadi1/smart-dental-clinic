from datetime import date
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.booking import generate_available_slots
from app.models import Appointment, Doctor, FAQItem, Service

EMERGENCY_REPLY = (
    "I’m sorry you’re experiencing this. I cannot provide a medical diagnosis, but this may require urgent care. "
    "Please contact the clinic directly or emergency services if the situation is severe."
)

UNKNOWN_REPLY = (
    "I’m sorry, I do not have an answer for that yet. I can help with clinic services, working hours, prices, "
    "location, emergency guidance, and appointment booking."
)

GREETING_REPLY = (
    "Hello, welcome to Chaam Dental Centre. How may I help you today?"
)

BOOKING_START_REPLY = (
    "I can help you book an appointment. Which dental service do you need?"
)

EMERGENCY_KEYWORDS = {
    "severe pain",
    "swelling",
    "bleeding",
    "trauma",
    "fever",
    "infection",
}

GREETING_KEYWORDS = {"hello", "hi", "hey", "good morning", "good afternoon", "good evening"}
BOOKING_KEYWORDS = {
    "book",
    "appointment",
    "schedule",
    "visit",
    "dentist",
    "tooth pain",
}

APPOINTMENT_STATUS_KEYWORDS = {
    "appointment confirmed",
    "appointment status",
    "my appointment",
    "is my appointment",
    "confirmed",
    "status",
}

FAQ_INTENT_KEYWORDS = {
    "ask_working_hours": {"hours", "working hours", "open", "opening"},
    "ask_services": {"services", "treatments", "cleaning", "filling", "whitening", "implant", "root canal"},
    "ask_prices": {"price", "prices", "cost", "fee", "fees"},
    "ask_location": {"location", "address", "where"},
    "ask_emergency": {"emergency", "urgent"},
}


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def contains_any(text: str, keywords: set[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def detect_intent(message: str) -> str:
    text = normalize_text(message)
    if not text:
        return "unknown"

    if contains_any(text, EMERGENCY_KEYWORDS):
        return "ask_emergency"

    if contains_any(text, GREETING_KEYWORDS):
        return "greeting"

    if contains_any(text, APPOINTMENT_STATUS_KEYWORDS):
        return "appointment_status"

    if contains_any(text, BOOKING_KEYWORDS):
        return "booking_request"

    for intent, keywords in FAQ_INTENT_KEYWORDS.items():
        if contains_any(text, keywords):
            return intent

    return "unknown"


def find_faq_answer(db: Session, message: str, intent: str) -> FAQItem | None:
    text = normalize_text(message)
    faq_items = db.scalars(select(FAQItem).where(FAQItem.active.is_(True))).all()

    for faq_item in faq_items:
        tags = [str(tag).lower() for tag in faq_item.tags]
        if any(tag in text for tag in tags):
            return faq_item

    intent_tags = {
        "ask_working_hours": {"working hours", "hours", "opening"},
        "ask_prices": {"prices", "cost", "fees"},
        "ask_location": {"location", "address"},
        "ask_emergency": {"emergency", "urgent"},
        "ask_services": {"services", "treatments"},
    }.get(intent, set())

    for faq_item in faq_items:
        tags = [str(tag).lower() for tag in faq_item.tags]
        if any(tag in intent_tags for tag in tags):
            return faq_item

    return None


def split_name_parts(value: str) -> list[str]:
    return [part for part in normalize_text(value).split(" ") if part]


def appointment_name_matches(patient_name: str, search_name: str) -> bool:
    patient_parts = split_name_parts(patient_name)
    search_parts = split_name_parts(search_name)

    if not search_parts:
        return False

    if len(search_parts) == 1:
        return search_parts[0] in patient_parts

    return " ".join(search_parts) == " ".join(patient_parts)


def find_latest_appointment_by_patient_name(db: Session, patient_name: str) -> Appointment | None:
    normalized_name = normalize_text(patient_name)
    appointments = db.scalars(
        select(Appointment).order_by(
            Appointment.appointment_date.desc(),
            Appointment.start_time.desc(),
        )
    ).all()

    for appointment in appointments:
        if appointment_name_matches(appointment.patient_name, normalized_name):
            return appointment

    return None


def build_appointment_status_reply(db: Session, message: str, state: dict | None = None) -> dict:
    state = state or {}
    patient_name = state.get("patient_name")

    if state.get("last_next_action") == "ask_appointment_patient_name":
        patient_name = message

    if not patient_name:
        return {
            "reply": "I can check your appointment status. Please enter the name used for booking.",
            "intent": "appointment_status",
            "next_action": "ask_appointment_patient_name",
            "data": {},
        }

    if not split_name_parts(str(patient_name)):
        return {
            "reply": "Please enter the name used for booking so I can find your appointment.",
            "intent": "appointment_status",
            "next_action": "ask_appointment_patient_name",
            "data": {},
        }

    appointment = find_latest_appointment_by_patient_name(db, str(patient_name))
    if appointment is None:
        return {
            "reply": "I could not find an appointment with that name. Please check the spelling or contact the clinic directly.",
            "intent": "appointment_status",
            "next_action": None,
            "data": {"patient_name": patient_name},
        }

    reply = (
        f"I found your appointment, {appointment.patient_name}. "
        f"Date: {appointment.appointment_date}. "
        f"Time: {appointment.start_time}. "
        f"Status: {appointment.status}."
    )
    return {
        "reply": reply,
        "intent": "appointment_status",
        "next_action": None,
        "data": {
            "appointment": {
                "patient_name": appointment.patient_name,
                "appointment_date": str(appointment.appointment_date),
                "start_time": str(appointment.start_time),
                "end_time": str(appointment.end_time),
                "status": appointment.status,
                "doctor_id": appointment.doctor_id,
                "service_id": appointment.service_id,
            }
        },
    }


def service_options(db: Session) -> list[dict[str, str | int]]:
    services = db.scalars(select(Service).where(Service.active.is_(True)).order_by(Service.name)).all()
    return [
        {
            "id": service.id,
            "name": service.name,
            "duration_minutes": service.duration_minutes,
        }
        for service in services
    ]


def doctor_options(db: Session) -> list[dict[str, str | int]]:
    doctors = db.scalars(select(Doctor).where(Doctor.active.is_(True)).order_by(Doctor.name)).all()
    return [
        {
            "id": doctor.id,
            "name": doctor.name,
            "specialization": doctor.specialization,
        }
        for doctor in doctors
    ]


def build_booking_reply(db: Session, state: dict | None) -> dict:
    state = state or {}

    if not state.get("service_id"):
        services = service_options(db)
        return {
            "reply": "I can help you book an appointment. Which dental service do you need?",
            "intent": "booking_request",
            "next_action": "ask_service",
            "data": {"services": services},
        }

    if not state.get("doctor_id") and not state.get("no_preference"):
        doctors = doctor_options(db)
        return {
            "reply": "Which doctor would you prefer? You can also choose no preference.",
            "intent": "booking_request",
            "next_action": "ask_doctor",
            "data": {"doctors": doctors, "allow_no_preference": True},
        }

    if not state.get("date"):
        return {
            "reply": "What date would you like for the appointment? Please use YYYY-MM-DD format.",
            "intent": "booking_request",
            "next_action": "ask_date",
            "data": {},
        }

    if not state.get("start_time"):
        doctor_id = state.get("doctor_id")
        if doctor_id is None:
            doctor = db.scalar(select(Doctor).where(Doctor.active.is_(True)).order_by(Doctor.name))
            doctor_id = doctor.id if doctor else None

        if doctor_id is None:
            return {
                "reply": "I could not find an available doctor. Please contact the clinic directly.",
                "intent": "booking_request",
                "next_action": None,
                "data": {},
            }

        try:
            requested_date = date.fromisoformat(str(state["date"]))
        except ValueError:
            return {
                "reply": "Please enter the appointment date in YYYY-MM-DD format.",
                "intent": "booking_request",
                "next_action": "ask_date",
                "data": {},
            }

        slots = generate_available_slots(db, int(doctor_id), int(state["service_id"]), requested_date)
        return {
            "reply": "Here are the available time slots. Which time would you prefer?",
            "intent": "booking_request",
            "next_action": "ask_time",
            "data": {"doctor_id": doctor_id, "date": str(requested_date), "slots": slots},
        }

    if not state.get("patient_name"):
        return {
            "reply": "Please enter your full name.",
            "intent": "booking_request",
            "next_action": "ask_patient_name",
            "data": {},
        }

    if not state.get("patient_email"):
        return {
            "reply": "Please enter your email address.",
            "intent": "booking_request",
            "next_action": "ask_patient_email",
            "data": {},
        }

    if not state.get("patient_phone"):
        return {
            "reply": "Please enter your phone number.",
            "intent": "booking_request",
            "next_action": "ask_patient_phone",
            "data": {},
        }

    return {
        "reply": "Thank you. I have the details needed to confirm your appointment.",
        "intent": "booking_request",
        "next_action": "confirm_appointment",
        "data": state,
    }


def build_chat_response(db: Session, message: str, state: dict | None = None) -> dict:
    intent = detect_intent(message)
    text = normalize_text(message)

    if contains_any(text, EMERGENCY_KEYWORDS):
        return {
            "reply": EMERGENCY_REPLY,
            "intent": "ask_emergency",
            "next_action": "contact_clinic_or_emergency_services",
            "data": {},
        }

    if intent == "greeting":
        return {
            "reply": GREETING_REPLY,
            "intent": "greeting",
            "next_action": None,
            "data": {},
        }

    if intent == "appointment_status" or (state and state.get("last_next_action") == "ask_appointment_patient_name"):
        return build_appointment_status_reply(db, message, state)

    if intent == "booking_request" or state:
        return build_booking_reply(db, state)

    faq_item = find_faq_answer(db, message, intent)
    if faq_item:
        return {
            "reply": faq_item.answer,
            "intent": intent,
            "next_action": None,
            "data": {"faq_id": faq_item.id},
        }

    if intent == "ask_services":
        return {
            "reply": "We offer several dental services. Please see the available services below.",
            "intent": "ask_services",
            "next_action": None,
            "data": {"services": service_options(db)},
        }

    return {
        "reply": UNKNOWN_REPLY,
        "intent": "unknown",
        "next_action": None,
        "data": {},
    }
