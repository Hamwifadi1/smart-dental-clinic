export const fallbackServices = [
  { id: 1, name: "Dental Cleaning", duration_minutes: 30, description: "Gentle preventive cleaning for a healthier smile." },
  { id: 2, name: "Dental Filling", duration_minutes: 45, description: "Tooth-colored fillings for small cavities and repairs." },
  { id: 3, name: "Root Canal Consultation", duration_minutes: 60, description: "Careful evaluation for root canal treatment needs." },
  { id: 4, name: "Teeth Whitening", duration_minutes: 60, description: "Professional whitening consultation and treatment planning." },
  { id: 5, name: "Implant Consultation", duration_minutes: 60, description: "Implant planning with a specialist consultation." },
  { id: 6, name: "Emergency Consultation", duration_minutes: 30, description: "Urgent consultation for dental pain or sudden concerns." },
];

export const fallbackDoctors = [
  { id: 1, name: "Dr. Anna Weber", specialization: "General Dentist" },
  { id: 2, name: "Dr. Michael Schmidt", specialization: "Implant Specialist" },
];

export const fallbackAppointments = [
  {
    id: 1,
    patient_name: "Jane Patient",
    patient_email: "jane@example.com",
    patient_phone: "+49 123456",
    appointment_date: "2030-01-07",
    start_time: "09:00:00",
    end_time: "09:30:00",
    status: "pending",
    doctor_id: 1,
    service_id: 1,
  },
];

export const fallbackFaqs = [
  { id: 1, question: "What are your working hours?", answer: "Monday to Friday, 09:00 to 18:00.", tags: ["hours"], active: true },
  { id: 2, question: "How can I book?", answer: "Choose a service, doctor, date, and available time.", tags: ["booking"], active: true },
];

export const fallbackBlockedSlots = [
  { id: 1, doctor_id: 1, date: "2030-01-09", start_time: "12:00:00", end_time: "13:00:00", reason: "Lunch meeting" },
];

export const fallbackTreatmentRecords = [];
