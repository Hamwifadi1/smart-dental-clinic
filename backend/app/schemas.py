from datetime import date as DateType, datetime, time as TimeType
from decimal import Decimal
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

VALID_APPOINTMENT_STATUSES = {"pending", "confirmed", "rejected", "cancelled", "completed"}


class ServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clinic_id: int
    name: str
    description: str
    duration_minutes: int
    price_min: Decimal | None
    price_max: Decimal | None
    active: bool


class ServiceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    duration_minutes: int = Field(gt=0)
    price_min: Decimal | None = None
    price_max: Decimal | None = None
    active: bool = True


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    price_min: Decimal | None = None
    price_max: Decimal | None = None
    active: bool | None = None


class DoctorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clinic_id: int
    name: str
    specialization: str
    email: str | None
    phone: str | None
    active: bool


class DoctorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    specialization: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    password: str = Field(min_length=1, max_length=255)
    active: bool = True

    @field_validator("name", "specialization", "password")
    @classmethod
    def clean_required_text(cls, value: str) -> str:
        clean_value = value.strip()
        if not clean_value:
            raise ValueError("This field is required.")
        return clean_value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        clean_value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", clean_value):
            raise ValueError("A valid email address is required.")
        return clean_value

    @field_validator("phone")
    @classmethod
    def clean_optional_contact(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean_value = value.strip()
        return clean_value or None


class DoctorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    specialization: str | None = Field(default=None, min_length=1, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    password: str | None = Field(default=None, min_length=1, max_length=255)
    active: bool | None = None

    @field_validator("name", "specialization")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean_value = value.strip()
        if not clean_value:
            raise ValueError("This field is required.")
        return clean_value

    @field_validator("email")
    @classmethod
    def validate_optional_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean_value = value.strip().lower()
        if not clean_value:
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", clean_value):
            raise ValueError("A valid email address is required.")
        return clean_value

    @field_validator("phone", "password")
    @classmethod
    def clean_optional_contact(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean_value = value.strip()
        return clean_value or None


class AvailabilitySlot(BaseModel):
    start_time: TimeType
    end_time: TimeType


class AppointmentCreate(BaseModel):
    doctor_id: int
    service_id: int
    appointment_date: DateType
    start_time: TimeType
    patient_name: str = Field(min_length=1, max_length=255)
    patient_email: str = Field(default="manual-booking@chaam-dental.local", min_length=3, max_length=255)
    patient_phone: str = Field(min_length=1, max_length=50)
    notes: str = Field(default="", max_length=1000)

    @field_validator("patient_name", "patient_phone")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        clean_value = value.strip()
        if not clean_value:
            raise ValueError("This field is required.")
        return clean_value

    @field_validator("patient_email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        clean_value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", clean_value):
            raise ValueError("A valid email address is required.")
        return clean_value

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str) -> str:
        return value.strip()


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clinic_id: int
    doctor_id: int
    doctor_name: str
    service_id: int
    service_name: str
    patient_name: str
    patient_email: str
    patient_phone: str
    appointment_date: DateType
    start_time: TimeType
    end_time: TimeType
    status: str
    notes: str
    created_at: datetime


class AppointmentStatusUpdate(BaseModel):
    status: str = Field(min_length=1, max_length=50)
    admin_message: str = Field(default="", max_length=1000)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        clean_value = value.strip().lower()
        if clean_value not in VALID_APPOINTMENT_STATUSES:
            raise ValueError("Status must be pending, confirmed, rejected, cancelled, or completed.")
        return clean_value

    @field_validator("admin_message")
    @classmethod
    def clean_admin_message(cls, value: str) -> str:
        return value.strip()


class FAQRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clinic_id: int
    question: str
    answer: str
    tags: list[str]
    active: bool


class FAQCreate(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1)
    tags: list[str] = []
    active: bool = True


class FAQUpdate(BaseModel):
    question: str | None = Field(default=None, min_length=1, max_length=500)
    answer: str | None = Field(default=None, min_length=1)
    tags: list[str] | None = None
    active: bool | None = None


class BlockedSlotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doctor_id: int
    date: DateType
    start_time: TimeType
    end_time: TimeType
    reason: str


class BlockedSlotCreate(BaseModel):
    doctor_id: int | None = None
    date: DateType
    start_time: TimeType
    end_time: TimeType
    reason: str = "Unavailable"


class BlockedSlotUpdate(BaseModel):
    date: DateType | None = None
    start_time: TimeType | None = None
    end_time: TimeType | None = None
    reason: str | None = None


class TreatmentRecordBase(BaseModel):
    patient_name: str = Field(min_length=1, max_length=255)
    patient_phone: str | None = Field(default=None, max_length=50)
    service_id: int = Field(gt=0)
    base_price: Decimal = Field(ge=0)
    paid_amount: Decimal = Field(ge=0)
    treatment_datetime: datetime
    doctor_id: int = Field(gt=0)
    notes: str = ""

    @field_validator("patient_name")
    @classmethod
    def clean_patient_name(cls, value: str) -> str:
        clean_value = value.strip()
        if not clean_value:
            raise ValueError("Patient name is required.")
        return clean_value

    @field_validator("patient_phone", "notes")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean_value = value.strip()
        return clean_value or None

    @model_validator(mode="after")
    def validate_payment_amounts(self) -> "TreatmentRecordBase":
        if self.paid_amount > self.base_price:
            raise ValueError("Paid amount cannot exceed base price.")
        return self


class TreatmentRecordCreate(TreatmentRecordBase):
    pass


class TreatmentRecordUpdate(BaseModel):
    patient_name: str | None = Field(default=None, min_length=1, max_length=255)
    patient_phone: str | None = Field(default=None, max_length=50)
    service_id: int | None = Field(default=None, gt=0)
    base_price: Decimal | None = Field(default=None, ge=0)
    paid_amount: Decimal | None = Field(default=None, ge=0)
    treatment_datetime: datetime | None = None
    doctor_id: int | None = Field(default=None, gt=0)
    notes: str | None = None

    @field_validator("patient_name")
    @classmethod
    def clean_optional_patient_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean_value = value.strip()
        if not clean_value:
            raise ValueError("Patient name is required.")
        return clean_value

    @field_validator("patient_phone", "notes")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean_value = value.strip()
        return clean_value or None


class TreatmentRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clinic_id: int
    patient_name: str
    patient_phone: str | None
    service_id: int | None
    service_name: str
    base_price: Decimal
    paid_amount: Decimal
    remaining_amount: Decimal
    treatment_datetime: datetime
    doctor_id: int | None
    doctor_name: str
    notes: str
    created_at: datetime
    updated_at: datetime


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    state: dict | None = None

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        clean_value = value.strip()
        if not clean_value:
            raise ValueError("Message is required.")
        return clean_value


class ChatResponse(BaseModel):
    reply: str
    intent: str
    next_action: str | None
    data: dict


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=255)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str
    clinic_id: int
    doctor_id: int | None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
