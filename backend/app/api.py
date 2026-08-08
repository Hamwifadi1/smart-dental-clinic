from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.booking import add_minutes, generate_available_slots, is_slot_available
from app.chatbot import build_chat_response
from app.database import get_db
from app.models import Appointment, BlockedSlot, Doctor, FAQItem, Service, TreatmentRecord, User
from app.notifications import send_appointment_status_notification
from app.schemas import AppointmentCreate, AppointmentRead, AppointmentStatusUpdate, AvailabilitySlot, BlockedSlotCreate, BlockedSlotRead, BlockedSlotUpdate, ChatRequest, ChatResponse, DoctorCreate, DoctorRead, DoctorUpdate, FAQCreate, FAQRead, FAQUpdate, LoginRequest, ServiceCreate, ServiceRead, ServiceUpdate, TokenResponse, TreatmentRecordCreate, TreatmentRecordRead, TreatmentRecordUpdate, UserRead
from app.security import ROLE_ADMIN_DOCTOR, ROLE_DOCTOR, create_access_token, decode_access_token, get_current_admin_user, get_current_user, hash_password, normalize_role, verify_password

router = APIRouter(prefix="/api")


def sync_doctor_login_user(
    db: Session,
    doctor: Doctor,
    password: str | None = None,
    require_password: bool = False,
) -> None:
    if not doctor.email:
        if require_password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Doctor email is required for login.")
        return

    doctor_user = db.scalar(
        select(User).where(User.doctor_id == doctor.id, User.role == ROLE_DOCTOR)
    )
    email_user = db.scalar(select(User).where(User.email == doctor.email))

    if email_user and email_user.role != ROLE_DOCTOR:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This email is already used by another dashboard user.")
    if doctor_user and email_user and doctor_user.id != email_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This email is already used by another doctor.")

    user = doctor_user or email_user
    if user is None:
        if not password:
            if require_password:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Doctor password is required.")
            return
        user = User(
            clinic_id=doctor.clinic_id,
            doctor_id=doctor.id,
            name=doctor.name,
            email=doctor.email,
            password_hash=hash_password(password),
            role=ROLE_DOCTOR,
        )
        db.add(user)
        return

    user.clinic_id = doctor.clinic_id
    user.doctor_id = doctor.id
    user.name = doctor.name
    user.email = doctor.email
    user.role = ROLE_DOCTOR
    if password:
        user.password_hash = hash_password(password)


def get_active_treatment_doctor_and_service(
    db: Session,
    doctor_id: int,
    service_id: int,
) -> tuple[Doctor, Service]:
    doctor = db.get(Doctor, doctor_id)
    if doctor is None or not doctor.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found.")

    service = db.get(Service, service_id)
    if service is None or not service.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    if doctor.clinic_id != service.clinic_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Doctor and service do not belong to the same clinic.")

    return doctor, service


def calculate_remaining_amount(base_price: Decimal, paid_amount: Decimal) -> Decimal:
    if paid_amount > base_price:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Paid amount cannot exceed base price.")
    return base_price - paid_amount


def get_optional_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User | None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None

    payload = decode_access_token(token)
    user_id = payload.get("sub")
    user = db.get(User, int(user_id)) if user_id else None
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")

    user.role = normalize_role(user.role)
    return user


def ensure_treatment_record_access(current_user: User | None, record: TreatmentRecord) -> None:
    if current_user is None or current_user.role == ROLE_ADMIN_DOCTOR:
        return
    if current_user.role == ROLE_DOCTOR and current_user.doctor_id and record.doctor_id == current_user.doctor_id:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only access your own treatment records.")


@router.post("/auth/login", response_model=TokenResponse)
def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    user = db.scalar(select(User).where(User.email == login_data.email))
    if user is None or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    user.role = normalize_role(user.role)
    if user.role not in {ROLE_ADMIN_DOCTOR, ROLE_DOCTOR}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dashboard access required.")

    return {"access_token": create_access_token(user), "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/chat", response_model=ChatResponse)
def chat(
    chat_request: ChatRequest,
    db: Session = Depends(get_db),
) -> dict:
    return build_chat_response(db, chat_request.message, chat_request.state)


@router.get("/services", response_model=list[ServiceRead])
def list_services(db: Session = Depends(get_db)) -> list[Service]:
    return list(db.scalars(select(Service).where(Service.active.is_(True)).order_by(Service.name)))


@router.get("/doctors", response_model=list[DoctorRead])
def list_doctors(db: Session = Depends(get_db)) -> list[Doctor]:
    return list(db.scalars(select(Doctor).where(Doctor.active.is_(True)).order_by(Doctor.name)))


@router.get("/secretary/treatment-records", response_model=list[TreatmentRecordRead])
def list_treatment_records(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> list[TreatmentRecord]:
    query = select(TreatmentRecord)
    if current_user and current_user.role == ROLE_DOCTOR:
        if not current_user.doctor_id:
            return []
        query = query.where(TreatmentRecord.doctor_id == current_user.doctor_id)

    return list(
        db.scalars(
            query.order_by(
                TreatmentRecord.treatment_datetime.desc(),
                TreatmentRecord.id.desc(),
            )
        )
    )


@router.post("/secretary/treatment-records", response_model=TreatmentRecordRead, status_code=status.HTTP_201_CREATED)
def create_treatment_record(
    record_data: TreatmentRecordCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> TreatmentRecord:
    if current_user and current_user.role == ROLE_DOCTOR and record_data.doctor_id != current_user.doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctors can only create their own treatment records.")

    doctor, service = get_active_treatment_doctor_and_service(db, record_data.doctor_id, record_data.service_id)
    remaining_amount = calculate_remaining_amount(record_data.base_price, record_data.paid_amount)

    record = TreatmentRecord(
        clinic_id=doctor.clinic_id,
        patient_name=record_data.patient_name,
        patient_phone=record_data.patient_phone,
        service_id=service.id,
        service_name=service.name,
        base_price=record_data.base_price,
        paid_amount=record_data.paid_amount,
        remaining_amount=remaining_amount,
        treatment_datetime=record_data.treatment_datetime,
        doctor_id=doctor.id,
        doctor_name=doctor.name,
        notes=record_data.notes or "",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.patch("/secretary/treatment-records/{record_id}", response_model=TreatmentRecordRead)
def update_treatment_record(
    record_id: int,
    record_data: TreatmentRecordUpdate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> TreatmentRecord:
    record = db.get(TreatmentRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment record not found.")
    ensure_treatment_record_access(current_user, record)

    base_price = record_data.base_price if record_data.base_price is not None else record.base_price
    paid_amount = record_data.paid_amount if record_data.paid_amount is not None else record.paid_amount
    remaining_amount = calculate_remaining_amount(base_price, paid_amount)

    if record_data.patient_name is not None:
        record.patient_name = record_data.patient_name
    if "patient_phone" in record_data.model_fields_set:
        record.patient_phone = record_data.patient_phone
    if record_data.service_id is not None:
        service = db.get(Service, record_data.service_id)
        if service is None or not service.active or service.clinic_id != record.clinic_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")
        record.service_id = service.id
        record.service_name = service.name
    if record_data.doctor_id is not None:
        if current_user and current_user.role == ROLE_DOCTOR and record_data.doctor_id != current_user.doctor_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctors can only assign their own treatment records.")
        doctor = db.get(Doctor, record_data.doctor_id)
        if doctor is None or not doctor.active or doctor.clinic_id != record.clinic_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found.")
        record.doctor_id = doctor.id
        record.doctor_name = doctor.name
    if record_data.treatment_datetime is not None:
        record.treatment_datetime = record_data.treatment_datetime
    if "notes" in record_data.model_fields_set:
        record.notes = record_data.notes or ""

    record.base_price = base_price
    record.paid_amount = paid_amount
    record.remaining_amount = remaining_amount

    db.commit()
    db.refresh(record)
    return record


@router.delete("/secretary/treatment-records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_treatment_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> Response:
    record = db.get(TreatmentRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment record not found.")
    ensure_treatment_record_access(current_user, record)

    db.delete(record)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/availability", response_model=list[AvailabilitySlot])
def get_availability(
    doctor_id: int = Query(gt=0),
    service_id: int = Query(gt=0),
    date_value: date = Query(alias="date"),
    db: Session = Depends(get_db),
) -> list[dict]:
    doctor = db.get(Doctor, doctor_id)
    if doctor is None or not doctor.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found.")

    service = db.get(Service, service_id)
    if service is None or not service.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    if doctor.clinic_id != service.clinic_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Doctor and service do not belong to the same clinic.")

    return generate_available_slots(db, doctor_id, service_id, date_value)


@router.post("/appointments", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
def create_appointment(
    appointment_data: AppointmentCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> Appointment:
    if current_user and current_user.role == ROLE_DOCTOR and appointment_data.doctor_id != current_user.doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctors can only create appointments for themselves.")

    doctor = db.get(Doctor, appointment_data.doctor_id)
    if doctor is None or not doctor.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found.")

    service = db.get(Service, appointment_data.service_id)
    if service is None or not service.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    if doctor.clinic_id != service.clinic_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Doctor and service do not belong to the same clinic.")

    if not is_slot_available(
        db,
        appointment_data.doctor_id,
        appointment_data.service_id,
        appointment_data.appointment_date,
        appointment_data.start_time,
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected slot is not available.")

    appointment = Appointment(
        clinic_id=doctor.clinic_id,
        doctor_id=appointment_data.doctor_id,
        service_id=appointment_data.service_id,
        patient_name=appointment_data.patient_name,
        patient_email=appointment_data.patient_email,
        patient_phone=appointment_data.patient_phone,
        appointment_date=appointment_data.appointment_date,
        start_time=appointment_data.start_time,
        end_time=add_minutes(appointment_data.start_time, service.duration_minutes),
        status="pending",
        notes=appointment_data.notes,
    )
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment


@router.get("/appointments", response_model=list[AppointmentRead])
def list_appointments(
    patient_name: str | None = None,
    db: Session = Depends(get_db),
) -> list[Appointment]:
    query = select(Appointment).order_by(
        Appointment.appointment_date,
        Appointment.start_time,
        Appointment.patient_name,
    )

    if patient_name:
        query = query.where(Appointment.patient_name.ilike(f"%{patient_name.strip()}%"))

    return list(db.scalars(query))


@router.get("/appointments/{appointment_id}", response_model=AppointmentRead)
def get_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
) -> Appointment:
    appointment = db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")

    return appointment


@router.get("/admin/appointments", response_model=list[AppointmentRead])
def list_admin_appointments(
    doctor_id: int | None = None,
    appointment_date: date | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    service_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Appointment]:
    query = (
        select(Appointment)
        .where(Appointment.clinic_id == current_user.clinic_id)
    )

    if current_user.role == ROLE_DOCTOR:
        if current_user.doctor_id is None:
            return []
        query = query.where(Appointment.doctor_id == current_user.doctor_id)
    elif current_user.role != ROLE_ADMIN_DOCTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dashboard access required.")

    if doctor_id is not None:
        if current_user.role == ROLE_DOCTOR and doctor_id != current_user.doctor_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot view another doctor's appointments.")
        query = query.where(Appointment.doctor_id == doctor_id)

    if appointment_date is not None:
        query = query.where(Appointment.appointment_date == appointment_date)

    if status_filter:
        query = query.where(Appointment.status == status_filter)

    if service_id is not None:
        query = query.where(Appointment.service_id == service_id)

    query = query.order_by(Appointment.appointment_date, Appointment.start_time, Appointment.patient_name)
    return list(db.scalars(query))


@router.patch("/admin/appointments/{appointment_id}", response_model=AppointmentRead)
def update_admin_appointment_status(
    appointment_id: int,
    update_data: AppointmentStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Appointment:
    appointment = db.get(Appointment, appointment_id)
    if appointment is None or appointment.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")

    if current_user.role == ROLE_DOCTOR and appointment.doctor_id != current_user.doctor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update appointments assigned to you.",
        )
    if current_user.role != ROLE_ADMIN_DOCTOR and current_user.role != ROLE_DOCTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dashboard access required.")

    appointment.status = update_data.status
    db.commit()
    db.refresh(appointment)

    if appointment.status in {"confirmed", "rejected", "cancelled"}:
        send_appointment_status_notification(appointment, update_data.admin_message)

    return appointment


@router.delete("/admin/appointments/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_admin_appointment(
    appointment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    appointment = db.get(Appointment, appointment_id)
    if appointment is None or appointment.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")

    if current_user.role == ROLE_DOCTOR and appointment.doctor_id != current_user.doctor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete appointments assigned to you.",
        )
    if current_user.role not in {ROLE_ADMIN_DOCTOR, ROLE_DOCTOR}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dashboard access required.")

    db.delete(appointment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/doctors", response_model=list[DoctorRead])
def list_dashboard_doctors(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> list[Doctor]:
    return list(
        db.scalars(
            select(Doctor)
            .where(Doctor.clinic_id == current_user.clinic_id)
            .order_by(Doctor.name)
        )
    )


@router.post("/admin/doctors", response_model=DoctorRead, status_code=status.HTTP_201_CREATED)
def create_admin_doctor(
    doctor_data: DoctorCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Doctor:
    doctor = Doctor(
        clinic_id=current_user.clinic_id,
        name=doctor_data.name,
        specialization=doctor_data.specialization,
        email=doctor_data.email,
        phone=doctor_data.phone,
        active=doctor_data.active,
    )
    db.add(doctor)
    db.flush()
    sync_doctor_login_user(db, doctor, doctor_data.password, require_password=True)
    db.commit()
    db.refresh(doctor)
    return doctor


@router.patch("/admin/doctors/{doctor_id}", response_model=DoctorRead)
def update_admin_doctor(
    doctor_id: int,
    doctor_data: DoctorUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Doctor:
    doctor = db.get(Doctor, doctor_id)
    if doctor is None or doctor.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found.")

    if doctor_data.name is not None:
        doctor.name = doctor_data.name
    if doctor_data.specialization is not None:
        doctor.specialization = doctor_data.specialization
    if "email" in doctor_data.model_fields_set:
        doctor.email = doctor_data.email
    if "phone" in doctor_data.model_fields_set:
        doctor.phone = doctor_data.phone
    if doctor_data.active is not None:
        doctor.active = doctor_data.active

    sync_doctor_login_user(db, doctor, doctor_data.password)
    db.commit()
    db.refresh(doctor)
    return doctor


@router.delete("/admin/doctors/{doctor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_admin_doctor(
    doctor_id: int,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Response:
    doctor = db.get(Doctor, doctor_id)
    if doctor is None or doctor.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found.")

    doctor_users = list(db.scalars(select(User).where(User.doctor_id == doctor.id, User.role == ROLE_DOCTOR)))
    for doctor_user in doctor_users:
        db.delete(doctor_user)
    db.delete(doctor)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/services", response_model=list[ServiceRead])
def list_admin_services(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> list[Service]:
    return list(db.scalars(select(Service).where(Service.clinic_id == current_user.clinic_id).order_by(Service.name)))


@router.post("/admin/services", response_model=ServiceRead, status_code=status.HTTP_201_CREATED)
def create_admin_service(
    service_data: ServiceCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Service:
    service = Service(clinic_id=current_user.clinic_id, **service_data.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.patch("/admin/services/{service_id}", response_model=ServiceRead)
def update_admin_service(
    service_id: int,
    service_data: ServiceUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Service:
    service = db.get(Service, service_id)
    if service is None or service.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    for field, value in service_data.model_dump(exclude_unset=True).items():
        setattr(service, field, value)
    db.commit()
    db.refresh(service)
    return service


@router.delete("/admin/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_admin_service(
    service_id: int,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Response:
    service = db.get(Service, service_id)
    if service is None or service.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    db.delete(service)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/faqs", response_model=list[FAQRead])
def list_admin_faqs(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> list[FAQItem]:
    return list(db.scalars(select(FAQItem).where(FAQItem.clinic_id == current_user.clinic_id).order_by(FAQItem.question)))


@router.post("/admin/faqs", response_model=FAQRead, status_code=status.HTTP_201_CREATED)
def create_admin_faq(
    faq_data: FAQCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> FAQItem:
    faq = FAQItem(clinic_id=current_user.clinic_id, **faq_data.model_dump())
    db.add(faq)
    db.commit()
    db.refresh(faq)
    return faq


@router.patch("/admin/faqs/{faq_id}", response_model=FAQRead)
def update_admin_faq(
    faq_id: int,
    faq_data: FAQUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> FAQItem:
    faq = db.get(FAQItem, faq_id)
    if faq is None or faq.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ item not found.")

    for field, value in faq_data.model_dump(exclude_unset=True).items():
        setattr(faq, field, value)
    db.commit()
    db.refresh(faq)
    return faq


@router.delete("/admin/faqs/{faq_id}", response_model=FAQRead)
def deactivate_admin_faq(
    faq_id: int,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> FAQItem:
    faq = db.get(FAQItem, faq_id)
    if faq is None or faq.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ item not found.")

    faq.active = False
    db.commit()
    db.refresh(faq)
    return faq


@router.get("/admin/blocked-slots", response_model=list[BlockedSlotRead])
def list_admin_blocked_slots(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BlockedSlot]:
    query = select(BlockedSlot).join(Doctor).where(Doctor.clinic_id == current_user.clinic_id)
    if current_user.role == ROLE_DOCTOR:
        query = query.where(BlockedSlot.doctor_id == current_user.doctor_id)
    elif current_user.role != ROLE_ADMIN_DOCTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dashboard access required.")

    return list(db.scalars(query.order_by(BlockedSlot.date, BlockedSlot.start_time)))


@router.post("/admin/blocked-slots", response_model=BlockedSlotRead, status_code=status.HTTP_201_CREATED)
def create_admin_blocked_slot(
    slot_data: BlockedSlotCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BlockedSlot:
    doctor_id = slot_data.doctor_id
    if current_user.role == ROLE_DOCTOR:
        doctor_id = current_user.doctor_id
    elif current_user.role != ROLE_ADMIN_DOCTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dashboard access required.")

    if doctor_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Doctor is required.")

    doctor = db.get(Doctor, doctor_id)
    if doctor is None or doctor.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found.")

    slot = BlockedSlot(
        doctor_id=doctor_id,
        date=slot_data.date,
        start_time=slot_data.start_time,
        end_time=slot_data.end_time,
        reason=slot_data.reason,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return slot


@router.patch("/admin/blocked-slots/{slot_id}", response_model=BlockedSlotRead)
def update_admin_blocked_slot(
    slot_id: int,
    slot_data: BlockedSlotUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BlockedSlot:
    slot = db.get(BlockedSlot, slot_id)
    if slot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocked slot not found.")

    doctor = db.get(Doctor, slot.doctor_id)
    if doctor is None or doctor.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocked slot not found.")

    if current_user.role == ROLE_DOCTOR and slot.doctor_id != current_user.doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only manage your own blocked slots.")
    if current_user.role not in {ROLE_ADMIN_DOCTOR, ROLE_DOCTOR}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dashboard access required.")

    for field, value in slot_data.model_dump(exclude_unset=True).items():
        setattr(slot, field, value)
    db.commit()
    db.refresh(slot)
    return slot


@router.delete("/admin/blocked-slots/{slot_id}", response_model=BlockedSlotRead)
def delete_admin_blocked_slot(
    slot_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BlockedSlot:
    slot = db.get(BlockedSlot, slot_id)
    if slot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocked slot not found.")

    doctor = db.get(Doctor, slot.doctor_id)
    if doctor is None or doctor.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocked slot not found.")

    if current_user.role == ROLE_DOCTOR and slot.doctor_id != current_user.doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only manage your own blocked slots.")
    if current_user.role not in {ROLE_ADMIN_DOCTOR, ROLE_DOCTOR}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dashboard access required.")

    db.delete(slot)
    db.commit()
    return slot
