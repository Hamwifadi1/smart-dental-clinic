from email.message import EmailMessage
import smtplib

from app.config import settings
from app.models import Appointment


def build_status_message(appointment: Appointment, admin_message: str) -> str:
    return (
        f"Hello {appointment.patient_name},\n\n"
        f"Your appointment status has been updated.\n\n"
        f"Date: {appointment.appointment_date}\n"
        f"Start time: {appointment.start_time}\n"
        f"Status: {appointment.status}\n"
        f"Message: {admin_message or 'No additional message.'}\n\n"
        "Chaam Dental Centre"
    )


def send_appointment_status_notification(appointment: Appointment, admin_message: str) -> None:
    subject = f"Appointment {appointment.status}"
    body = build_status_message(appointment, admin_message)

    if not settings.smtp_host or not settings.smtp_from_email:
        print("SMTP is not configured. Appointment notification would be sent:")
        print(f"To: {appointment.patient_email}")
        print(f"Subject: {subject}")
        print(body)
        return

    message = EmailMessage()
    message["From"] = settings.smtp_from_email
    message["To"] = appointment.patient_email
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_username and settings.smtp_password:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
