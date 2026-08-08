from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Appointment, BlockedSlot, Doctor, Service

WORK_START = time(hour=9)
WORK_END = time(hour=18)
BOOKING_STATUSES = {"pending", "confirmed"}
VALID_APPOINTMENT_STATUSES = {"pending", "confirmed", "rejected", "cancelled", "completed"}


def is_weekend(day: date) -> bool:
    return day.weekday() >= 5


def combine_date_time(day: date, value: time) -> datetime:
    return datetime.combine(day, value)


def add_minutes(value: time, minutes: int) -> time:
    return (datetime.combine(date.today(), value) + timedelta(minutes=minutes)).time()


def intervals_overlap(start_a: time, end_a: time, start_b: time, end_b: time) -> bool:
    return start_a < end_b and end_a > start_b


def is_past_slot(day: date, start_time: time, now: datetime | None = None) -> bool:
    current = now or datetime.now()
    return combine_date_time(day, start_time) <= current


def is_inside_working_hours(start_time: time, end_time: time) -> bool:
    return start_time >= WORK_START and end_time <= WORK_END and start_time < end_time


def get_busy_appointments(db: Session, doctor_id: int, day: date) -> list[Appointment]:
    return list(
        db.scalars(
            select(Appointment).where(
                Appointment.doctor_id == doctor_id,
                Appointment.appointment_date == day,
                Appointment.status.in_(BOOKING_STATUSES),
            )
        )
    )


def get_blocked_slots(db: Session, doctor_id: int, day: date) -> list[BlockedSlot]:
    return list(
        db.scalars(
            select(BlockedSlot).where(
                BlockedSlot.doctor_id == doctor_id,
                BlockedSlot.date == day,
            )
        )
    )


def slot_conflicts(
    start_time: time,
    end_time: time,
    appointments: list[Appointment],
    blocked_slots: list[BlockedSlot],
) -> bool:
    for appointment in appointments:
        if intervals_overlap(start_time, end_time, appointment.start_time, appointment.end_time):
            return True

    for blocked_slot in blocked_slots:
        if intervals_overlap(start_time, end_time, blocked_slot.start_time, blocked_slot.end_time):
            return True

    return False


def generate_available_slots(
    db: Session,
    doctor_id: int,
    service_id: int,
    day: date,
    now: datetime | None = None,
) -> list[dict[str, time]]:
    service = db.get(Service, service_id)
    if service is None or not service.active:
        return []

    doctor = db.get(Doctor, doctor_id)
    if doctor is None or not doctor.active:
        return []

    if doctor.clinic_id != service.clinic_id or is_weekend(day):
        return []

    appointments = get_busy_appointments(db, doctor_id, day)
    blocked_slots = get_blocked_slots(db, doctor_id, day)

    slots: list[dict[str, time]] = []
    current_start = WORK_START

    while True:
        current_end = add_minutes(current_start, service.duration_minutes)
        if current_end > WORK_END or current_end <= current_start:
            break

        if (
            not is_past_slot(day, current_start, now)
            and not slot_conflicts(current_start, current_end, appointments, blocked_slots)
        ):
            slots.append({"start_time": current_start, "end_time": current_end})

        current_start = current_end

    return slots


def is_slot_available(
    db: Session,
    doctor_id: int,
    service_id: int,
    day: date,
    start_time: time,
    now: datetime | None = None,
) -> bool:
    service = db.get(Service, service_id)
    if service is None:
        return False

    end_time = add_minutes(start_time, service.duration_minutes)
    available_slots = generate_available_slots(db, doctor_id, service_id, day, now)
    return {"start_time": start_time, "end_time": end_time} in available_slots
