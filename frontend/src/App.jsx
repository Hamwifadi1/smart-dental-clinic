import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock,
  LayoutDashboard,
  Lock,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Send,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { api } from "./api";
import {
  fallbackAppointments,
  fallbackBlockedSlots,
  fallbackDoctors,
  fallbackFaqs,
  fallbackServices,
  fallbackTreatmentRecords,
} from "./data";

const ROLE_ADMIN_DOCTOR = "ADMIN_DOCTOR";
const ROLE_DOCTOR = "DOCTOR";
const APPOINTMENT_DECISIONS = [
  ["", "All statuses"],
  ["pending", "Pending"],
  ["confirmed", "Accepted"],
  ["rejected", "Rejected"],
];
const APPOINTMENT_DATE_FILTERS = [
  ["all", "All"],
  ["today", "Today"],
  ["week", "This week"],
  ["next_week", "Next week"],
  ["month", "This month"],
];
const APPOINTMENT_SUGGESTION_MODES = [
  ["tomorrow", "Tomorrow"],
  ["week", "This week"],
  ["next_week", "Next week"],
  ["custom", "Custom day"],
];
const SECRETARY_DATE_FILTERS = [
  ["today", "Today"],
  ["week", "Week"],
  ["month", "Month"],
  ["year", "Year"],
  ["all", "All"],
];
const CLINIC_CLOSED_WEEKDAYS = new Set([0, 6]);

function formatStatusLabel(status) {
  if (status === "confirmed") return "Accepted";
  if (status === "rejected") return "Rejected";
  if (status === "completed") return "Accepted";
  if (status === "cancelled") return "Rejected";
  return "Pending";
}

function statusBadgeClass(status) {
  const classes = {
    pending: "bg-amber-50 text-amber-700 ring-amber-200",
    confirmed: "bg-green-50 text-green-700 ring-green-200",
    rejected: "bg-red-50 text-red-700 ring-red-200",
    cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
    completed: "bg-blue-50 text-clinic-blue ring-blue-200",
  };
  return classes[status] || "bg-slate-100 text-slate-600 ring-slate-200";
}

function getCurrentDateTimeInputValue() {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function getLocalDateValue(value = new Date()) {
  const timezoneOffsetMs = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function getWeekRange(value = new Date()) {
  const dateValue = new Date(value);
  const day = dateValue.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(dateValue);
  start.setDate(dateValue.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: getLocalDateValue(start),
    end: getLocalDateValue(end),
  };
}

function getMonthRange(value = new Date()) {
  const start = new Date(value.getFullYear(), value.getMonth(), 1);
  const end = new Date(value.getFullYear(), value.getMonth() + 1, 0);
  return {
    start: getLocalDateValue(start),
    end: getLocalDateValue(end),
  };
}

function getYearRange(value = new Date()) {
  const start = new Date(value.getFullYear(), 0, 1);
  const end = new Date(value.getFullYear(), 11, 31);
  return {
    start: getLocalDateValue(start),
    end: getLocalDateValue(end),
  };
}

function getDateModeRange(dateMode) {
  if (dateMode === "week") return getWeekRange();
  if (dateMode === "next_week") {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return getWeekRange(nextWeek);
  }
  if (dateMode === "month") return getMonthRange();
  return null;
}

function getSecretaryDateModeRange(dateMode) {
  if (dateMode === "today") {
    const today = getLocalDateValue();
    return { start: today, end: today };
  }
  if (dateMode === "week") return getWeekRange();
  if (dateMode === "month") return getMonthRange();
  if (dateMode === "year") return getYearRange();
  return null;
}

function getDateOnlyValue(value) {
  if (!value) return "";
  if (value instanceof Date) return getLocalDateValue(value);
  return String(value).slice(0, 10);
}

function isDateWithinRange(value, range) {
  if (!range) return true;
  const dateOnly = getDateOnlyValue(value);
  if (!dateOnly) return false;
  if (range.start && dateOnly < range.start) return false;
  if (range.end && dateOnly > range.end) return false;
  return true;
}

function addDays(value, days) {
  const dateValue = new Date(value);
  dateValue.setDate(dateValue.getDate() + days);
  return dateValue;
}

function getNextOpenClinicDate(value = new Date()) {
  const dateValue = addDays(value, 1);
  while (isClinicClosedDate(getLocalDateValue(dateValue))) {
    dateValue.setDate(dateValue.getDate() + 1);
  }
  return getLocalDateValue(dateValue);
}

function listDateValues(start, end) {
  const dates = [];
  const current = new Date(start);
  const endDate = new Date(end);
  while (current <= endDate) {
    dates.push(getLocalDateValue(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getAppointmentSuggestionDates(mode, customDate) {
  if (mode === "custom") return customDate ? [customDate] : [];
  if (mode === "tomorrow") return [getNextOpenClinicDate()];
  if (mode === "week") {
    const today = getLocalDateValue();
    const range = getWeekRange();
    return listDateValues(range.start, range.end).filter((dateValue) => dateValue >= today);
  }
  if (mode === "next_week") {
    const range = getWeekRange(addDays(new Date(), 7));
    return listDateValues(range.start, range.end);
  }
  return [];
}

function findLoggedInDoctor(user, doctors) {
  if (!user) return null;
  const userDoctorId = user.doctor_id ? Number(user.doctor_id) : null;
  return (
    doctors.find((doctor) => userDoctorId && Number(doctor.id) === userDoctorId) ||
    doctors.find((doctor) => doctor.email && user.email && doctor.email.toLowerCase() === user.email.toLowerCase()) ||
    doctors.find((doctor) => doctor.name && user.name && doctor.name.toLowerCase() === user.name.toLowerCase()) ||
    null
  );
}

function isClinicClosedDate(value) {
  const dateOnly = getDateOnlyValue(value);
  if (!dateOnly) return false;
  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!year || !month || !day) return false;
  return CLINIC_CLOSED_WEEKDAYS.has(new Date(year, month - 1, day).getDay());
}

function ClosedDayDate({ value, children }) {
  const closed = isClinicClosedDate(value);
  return (
    <span className={closed ? "font-semibold text-red-600" : ""} title={closed ? "Clinic closed day" : undefined}>
      {children ?? value}
    </span>
  );
}

function toDateTimeInputValue(value) {
  if (!value) return getCurrentDateTimeInputValue();
  return value.slice(0, 16);
}

function toMoneyNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatMoney(value) {
  return toMoneyNumber(value).toFixed(2);
}

function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [services, setServices] = useState(fallbackServices);
  const [doctors, setDoctors] = useState(fallbackDoctors);
  const [showBooking, setShowBooking] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const refreshPublicData = useCallback(async () => {
    try {
      const [serviceData, doctorData] = await Promise.all([api.getServices(), api.getDoctors()]);
      setServices(serviceData);
      setDoctors(doctorData);
    } catch {
      setServices(fallbackServices);
      setDoctors(fallbackDoctors);
    }
  }, []);

  useEffect(() => {
    refreshPublicData();
  }, [refreshPublicData]);

  function navigate(nextPath) {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (path.startsWith("/admin")) {
    return (
      <AdminPage
        navigate={navigate}
        publicDoctors={doctors}
        publicServices={services}
        onPublicDataChanged={refreshPublicData}
      />
    );
  }

  if (path.startsWith("/secretary")) {
    return <SecretaryPage navigate={navigate} doctors={doctors} services={services} />;
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <Header
        onBook={() => setShowBooking(true)}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        navigate={navigate}
      />
      <Landing onBook={() => setShowBooking(true)} />
      <ServicesSection services={services} onBook={() => setShowBooking(true)} />
      <DoctorsSection doctors={doctors} />
      <ContactSection />
      <ChatbotWidget />
      {showBooking && (
        <BookingModal
          services={services}
          doctors={doctors}
          onClose={() => setShowBooking(false)}
        />
      )}
    </main>
  );
}

function Header({ onBook, mobileMenuOpen, setMobileMenuOpen, navigate }) {
  const links = [
    ["Services", "#services"],
    ["Doctors", "#doctors"],
    ["Contact", "#contact"],
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex items-center gap-3 text-clinic-blue">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-clinic-light">
            <Stethoscope size={22} />
          </span>
          <span className="text-lg font-bold">Chaam Dental Centre</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-700 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="hover:text-clinic-blue">
              {label}
            </a>
          ))}
          <a href="/admin" className="hover:text-clinic-blue">
            Dashboard
          </a>
          <button type="button" onClick={onBook} className="btn-primary">
            <CalendarCheck size={18} />
            Book
          </button>
        </nav>
        <button
          type="button"
          className="icon-button md:hidden"
          aria-label="Open menu"
          onClick={() => setMobileMenuOpen((value) => !value)}
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {mobileMenuOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {links.map(([label, href]) => (
              <a key={href} href={href} className="text-sm font-medium text-slate-700">
                {label}
              </a>
            ))}
            <a href="/admin" className="text-sm font-medium text-slate-700">
              Dashboard
            </a>
            <button type="button" onClick={onBook} className="btn-primary w-full justify-center">
              <CalendarCheck size={18} />
              Book Appointment
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

function Landing({ onBook }) {
  return (
    <section id="top" className="bg-white">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:px-8">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase text-clinic-gold">
            Dental care in Cottbus
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight text-clinic-blue sm:text-5xl lg:text-6xl">
            Chaam Dental Centre
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">
            Professional dental consultations, online booking, and a helpful clinic chatbot for common questions.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={onBook} className="btn-primary justify-center">
              <CalendarCheck size={19} />
              Book Appointment
            </button>
            <a href="#services" className="btn-secondary justify-center">
              View Services
              <ChevronRight size={18} />
            </a>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <InfoPill icon={<Clock size={18} />} label="Mon-Fri" value="09:00-18:00" />
            <InfoPill icon={<Phone size={18} />} label="Phone" value="+49 000 000000" />
            <InfoPill icon={<MapPin size={18} />} label="Location" value="Cottbus" />
          </div>
        </div>
        <div className="relative min-h-[420px] overflow-hidden rounded-md border border-slate-200 bg-clinic-light">
          <div className="absolute inset-x-8 top-8 h-28 rounded-md bg-white/70" />
          <div className="absolute bottom-28 right-8 h-36 w-36 rounded-md bg-white/80" />
          <div className="relative flex h-full min-h-[420px] flex-col justify-end p-6 sm:p-8">
            <div className="mb-8 max-w-sm rounded-md bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-clinic-blue text-white">
                  <ShieldCheck size={23} />
                </span>
                <div>
                  <p className="font-semibold text-clinic-blue">Care-first booking</p>
                  <p className="text-sm text-slate-600">Clear slots, polite guidance, no diagnosis.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Metric value="6" label="Services" />
                <Metric value="2" label="Doctors" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["Cleaning", "Implants", "Emergency"].map((label) => (
                <div key={label} className="rounded-md bg-white/85 px-3 py-4 text-center text-sm font-semibold text-clinic-blue">
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoPill({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3">
      <span className="text-clinic-gold">{icon}</span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="font-semibold text-clinic-blue">{value}</p>
      </div>
    </div>
  );
}

function Metric({ value, label }) {
  return (
    <div className="rounded-md bg-clinic-light p-3">
      <p className="text-2xl font-bold text-clinic-blue">{value}</p>
      <p className="text-xs text-slate-600">{label}</p>
    </div>
  );
}

function ServicesSection({ services, onBook }) {
  return (
    <section id="services" className="bg-clinic-light py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Services" title="Dental care options" />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <article key={service.id} className="rounded-md border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <h3 className="text-lg font-bold text-clinic-blue">{service.name}</h3>
                <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-clinic-gold">
                  {service.duration_minutes} min
                </span>
              </div>
              <p className="min-h-14 text-sm leading-6 text-slate-600">
                {service.description || "Professional dental service from the Chaam Dental Centre team."}
              </p>
              <button type="button" onClick={onBook} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-clinic-blue">
                Book this service
                <ChevronRight size={16} />
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DoctorsSection({ doctors }) {
  return (
    <section id="doctors" className="bg-white py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Doctors" title="Meet the clinical team" />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {doctors.map((doctor) => (
            <article key={doctor.id} className="flex gap-4 rounded-md border border-slate-200 bg-white p-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-clinic-light text-clinic-blue">
                <UserRound size={25} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-clinic-blue">{doctor.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{doctor.specialization}</p>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  Calm, professional care with clear appointment planning and patient-friendly communication.
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContactSection() {
  return (
    <section id="contact" className="bg-clinic-light py-20">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div className="lg:col-span-1">
          <SectionHeading eyebrow="Contact" title="Visit Chaam Dental Centre" />
        </div>
        <div className="grid gap-4 md:grid-cols-3 lg:col-span-2">
          <ContactItem icon={<MapPin size={22} />} label="Address" value="Cottbus, Germany" />
          <ContactItem icon={<Phone size={22} />} label="Phone" value="+49 000 000000" />
          <ContactItem icon={<Mail size={22} />} label="Email" value="info@chaam-dental.com" />
        </div>
      </div>
    </section>
  );
}

function ContactItem({ icon, label, value }) {
  return (
    <div className="rounded-md bg-white p-5">
      <div className="mb-4 text-clinic-gold">{icon}</div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-clinic-blue">{value}</p>
    </div>
  );
}

function SectionHeading({ eyebrow, title }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase text-clinic-gold">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-bold text-clinic-blue sm:text-4xl">{title}</h2>
    </div>
  );
}

function BookingModal({ services, doctors, onClose }) {
  const [serviceId, setServiceId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [form, setForm] = useState({ patient_name: "", patient_email: "", patient_phone: "" });
  const [status, setStatus] = useState({ type: "idle", message: "" });

  const selectedService = services.find((service) => String(service.id) === serviceId);
  const selectedDateIsClosed = isClinicClosedDate(date);
  const canLoadSlots = serviceId && doctorId && date && !selectedDateIsClosed;

  useEffect(() => {
    setSelectedTime("");
    setSlots([]);
    if (!canLoadSlots) return;

    api
      .getAvailability({ doctorId, serviceId, date })
      .then(setSlots)
      .catch((error) => setStatus({ type: "error", message: error.message }));
  }, [canLoadSlots, date, doctorId, serviceId]);

  async function submitBooking(event) {
    event.preventDefault();
    if (selectedDateIsClosed) {
      setStatus({ type: "error", message: "Clinic closed day. Please choose another date." });
      return;
    }
    setStatus({ type: "loading", message: "Booking your appointment..." });

    try {
      const appointment = await api.createAppointment({
        doctor_id: Number(doctorId),
        service_id: Number(serviceId),
        appointment_date: date,
        start_time: selectedTime,
        ...form,
      });
      setStatus({
        type: "success",
        message: `Appointment requested for ${appointment.appointment_date} at ${appointment.start_time}. Status: ${appointment.status}.`,
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-md bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm font-semibold uppercase text-clinic-gold">Online booking</p>
            <h2 className="text-xl font-bold text-clinic-blue">Request an appointment</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close booking form">
            <X size={21} />
          </button>
        </div>
        <form onSubmit={submitBooking} className="grid gap-5 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Service">
              <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} required className="input">
                <option value="">Choose service</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Doctor">
              <select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required className="input">
                <option value="">Choose doctor</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
                className={`input ${selectedDateIsClosed ? "border-red-300 text-red-600" : ""}`}
                title={selectedDateIsClosed ? "Clinic closed day" : undefined}
              />
              {selectedDateIsClosed && (
                <p className="text-xs font-semibold text-red-600" title="Clinic closed day">
                  Clinic closed day. Please choose a weekday.
                </p>
              )}
            </Field>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-clinic-blue">
              Available slots {selectedService ? `(${selectedService.duration_minutes} minutes)` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {slots.length > 0 ? (
                slots.map((slot) => (
                  <button
                    type="button"
                    key={slot.start_time}
                    onClick={() => setSelectedTime(slot.start_time)}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                      selectedTime === slot.start_time
                        ? "border-clinic-blue bg-clinic-blue text-white"
                        : "border-slate-200 bg-white text-clinic-blue"
                    }`}
                  >
                    {slot.start_time.slice(0, 5)}
                  </button>
                ))
              ) : (
                <p className="col-span-full text-sm text-slate-600">
                  {selectedDateIsClosed ? "Clinic closed day. Please choose another date." : "Select a service, doctor, and date to load available slots."}
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Full name">
              <input value={form.patient_name} onChange={(event) => setForm({ ...form, patient_name: event.target.value })} required className="input" />
            </Field>
            <Field label="Email">
              <input type="email" value={form.patient_email} onChange={(event) => setForm({ ...form, patient_email: event.target.value })} required className="input" />
            </Field>
            <Field label="Phone">
              <input value={form.patient_phone} onChange={(event) => setForm({ ...form, patient_phone: event.target.value })} required className="input" />
            </Field>
          </div>
          {status.message && (
            <p className={`rounded-md px-4 py-3 text-sm ${status.type === "success" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
              {status.message}
            </p>
          )}
          <button type="submit" disabled={!selectedTime || selectedDateIsClosed || status.type === "loading"} className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60">
            <Check size={18} />
            Confirm Booking
          </button>
        </form>
      </div>
    </div>
  );
}

function ManualAppointmentForm({ doctors, services, token = "", user = null, onCreated, onCancel, title = "New Appointment" }) {
  const loggedInDoctor = user?.role === ROLE_DOCTOR ? findLoggedInDoctor(user, doctors) : null;
  const currentDoctorId = loggedInDoctor?.id ?? user?.doctor_id ?? "";
  const doctorOptions =
    user?.role === ROLE_DOCTOR
      ? loggedInDoctor
        ? [loggedInDoctor]
        : currentDoctorId
          ? [{ id: currentDoctorId, name: user?.name || "My doctor profile" }]
          : []
      : doctors;
  const activeDoctorOptions = doctorOptions.filter((doctor) => doctor.active !== false);
  const activeServices = services.filter((service) => service.active !== false);
  const defaultDoctorId = currentDoctorId || activeDoctorOptions[0]?.id || "";
  const defaultServiceId = activeServices[0]?.id || "";
  const [form, setForm] = useState({
    patient_name: "",
    patient_phone: "",
    service_id: defaultServiceId ? String(defaultServiceId) : "",
    doctor_id: defaultDoctorId ? String(defaultDoctorId) : "",
    date: getNextOpenClinicDate(),
    notes: "",
  });
  const [suggestionMode, setSuggestionMode] = useState("tomorrow");
  const [slotGroups, setSlotGroups] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [status, setStatus] = useState("");

  const selectedService = activeServices.find((service) => Number(service.id) === Number(form.service_id));
  const canLoadSlots = form.service_id && form.doctor_id && (suggestionMode !== "custom" || form.date);

  useEffect(() => {
    if (user?.role !== ROLE_DOCTOR || !currentDoctorId) return;
    setForm((current) => ({ ...current, doctor_id: String(currentDoctorId) }));
  }, [currentDoctorId, user?.role]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      service_id: current.service_id || (defaultServiceId ? String(defaultServiceId) : ""),
      doctor_id: current.doctor_id || (defaultDoctorId ? String(defaultDoctorId) : ""),
    }));
  }, [defaultDoctorId, defaultServiceId]);

  useEffect(() => {
    setSelectedSlot(null);
    setSlotGroups([]);
    if (!canLoadSlots) return;

    const dates = getAppointmentSuggestionDates(suggestionMode, form.date);
    if (!dates.length) return;

    let cancelled = false;
    setStatus("Loading available slots...");
    Promise.all(
      dates.map(async (dateValue) => {
        try {
          const slots = await api.getAvailability({
            doctorId: form.doctor_id,
            serviceId: form.service_id,
            date: dateValue,
          });
          return { date: dateValue, slots, error: "" };
        } catch (error) {
          return { date: dateValue, slots: [], error: error.message };
        }
      }),
    ).then((groups) => {
      if (cancelled) return;
      setSlotGroups(groups);
      const firstError = groups.find((group) => group.error)?.error;
      setStatus(firstError || "");
    });

    return () => {
      cancelled = true;
    };
  }, [canLoadSlots, form.date, form.doctor_id, form.service_id, suggestionMode]);

  function updateMode(mode) {
    setSuggestionMode(mode);
    if (mode === "tomorrow") {
      setForm((current) => ({ ...current, date: getNextOpenClinicDate() }));
    }
  }

  async function submitManualAppointment(event) {
    event.preventDefault();
    if (!selectedSlot) {
      setStatus("Please select an available time slot.");
      return;
    }

    setStatus("Creating appointment...");
    try {
      const appointment = await api.createAppointment(
        {
          doctor_id: Number(form.doctor_id),
          service_id: Number(form.service_id),
          appointment_date: selectedSlot.date,
          start_time: selectedSlot.start_time,
          patient_name: form.patient_name,
          patient_phone: form.patient_phone,
          notes: form.notes,
        },
        token,
      );
      setStatus(`Appointment created for ${appointment.patient_name} on ${appointment.appointment_date} at ${appointment.start_time?.slice(0, 5)}.`);
      setForm({
        patient_name: "",
        patient_phone: "",
        service_id: defaultServiceId ? String(defaultServiceId) : "",
        doctor_id: defaultDoctorId ? String(defaultDoctorId) : "",
        date: getNextOpenClinicDate(),
        notes: "",
      });
      setSuggestionMode("tomorrow");
      setSelectedSlot(null);
      setSlotGroups([]);
      await onCreated?.(appointment);
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <form onSubmit={submitManualAppointment} className="rounded-md border border-blue-100 bg-blue-50/40 p-5">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold uppercase text-clinic-gold">Manual booking</p>
          <h4 className="text-lg font-bold text-clinic-blue">{title}</h4>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary bg-white">
            Close
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Patient name">
          <input className="input bg-white" value={form.patient_name} onChange={(event) => setForm({ ...form, patient_name: event.target.value })} required />
        </Field>
        <Field label="Patient phone">
          <input className="input bg-white" value={form.patient_phone} onChange={(event) => setForm({ ...form, patient_phone: event.target.value })} required />
        </Field>
        <Field label="Service">
          <select className="input bg-white" value={form.service_id} onChange={(event) => setForm({ ...form, service_id: event.target.value })} required>
            <option value="">Choose service</option>
            {activeServices.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Doctor">
          <select
            className="input bg-white"
            value={form.doctor_id}
            onChange={(event) => setForm({ ...form, doctor_id: event.target.value })}
            required
            disabled={user?.role === ROLE_DOCTOR}
          >
            <option value="">{user?.role === ROLE_DOCTOR ? "Your doctor profile" : "Choose doctor"}</option>
            {activeDoctorOptions.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="grid gap-2 text-sm font-semibold text-clinic-blue md:col-span-2 lg:col-span-4">
          Notes
          <textarea className="input min-h-20 bg-white" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
      </div>

      <div className="mt-5 rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {APPOINTMENT_SUGGESTION_MODES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => updateMode(id)}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                suggestionMode === id ? "bg-clinic-blue text-white" : "bg-slate-100 text-slate-700 hover:bg-clinic-light"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {suggestionMode === "custom" && (
          <div className="mb-4 max-w-xs">
            <Field label="Custom day">
              <input className="input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
            </Field>
          </div>
        )}
        <p className="mb-3 text-sm font-semibold text-clinic-blue">
          Available time suggestions {selectedService ? `(${selectedService.duration_minutes} minutes)` : ""}
        </p>
        <div className="grid gap-3">
          {slotGroups.length > 0 ? (
            slotGroups.map((group) => (
              <div key={group.date} className="rounded-md border border-slate-100 p-3">
                <p className="mb-2 text-sm font-bold text-clinic-blue">
                  <ClosedDayDate value={group.date}>{group.date}</ClosedDayDate>
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.slots.length > 0 ? (
                    group.slots.map((slot) => {
                      const selected = selectedSlot?.date === group.date && selectedSlot?.start_time === slot.start_time;
                      return (
                        <button
                          type="button"
                          key={`${group.date}-${slot.start_time}`}
                          onClick={() => setSelectedSlot({ date: group.date, start_time: slot.start_time })}
                          className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${
                            selected ? "border-clinic-blue bg-clinic-blue text-white" : "border-slate-200 bg-white text-clinic-blue hover:border-clinic-blue"
                          }`}
                        >
                          {slot.start_time.slice(0, 5)}-{slot.end_time.slice(0, 5)}
                        </button>
                      );
                    })
                  ) : (
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400">
                      {group.error || (isClinicClosedDate(group.date) ? "Clinic closed day" : "No available slots")}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-600">Choose a service and doctor to load valid empty slots.</p>
          )}
        </div>
      </div>

      {status && <p className="mt-4 rounded-md bg-white px-4 py-3 text-sm text-clinic-blue">{status}</p>}
      <div className="mt-5 flex justify-end">
        <button type="submit" disabled={!selectedSlot} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
          <CalendarCheck size={18} />
          Create Appointment
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-clinic-blue">
      {label}
      {children}
    </label>
  );
}

function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [state, setState] = useState({});
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "Hello, welcome to Chaam Dental Centre. How may I help you today?",
      options: [
        { label: "Working hours", message: "What are your working hours?" },
        { label: "Services", message: "What services do you offer?" },
        { label: "Prices", message: "How much do treatments cost?" },
        { label: "Location", message: "Where is the clinic located?" },
        { label: "Book appointment", message: "I want to book an appointment" },
        { label: "Check appointment status", message: "Is my appointment confirmed?" },
      ],
    },
  ]);

  function getChatOptions(response) {
    if (response.next_action === "ask_service" && response.data?.services?.length) {
      return response.data.services.map((service) => ({
        label: service.name,
        message: `I need ${service.name}`,
        statePatch: { service_id: service.id },
      }));
    }

    if (response.next_action === "ask_doctor" && response.data?.doctors?.length) {
      return [
        ...response.data.doctors.map((doctor) => ({
          label: doctor.name,
          message: `I prefer ${doctor.name}`,
          statePatch: { doctor_id: doctor.id },
        })),
        {
          label: "No preference",
          message: "No preference",
          statePatch: { no_preference: true },
        },
      ];
    }

    if (response.next_action === "ask_time" && response.data?.slots?.length) {
      return response.data.slots.slice(0, 8).map((slot) => ({
        label: slot.start_time.slice(0, 5),
        message: `I choose ${slot.start_time.slice(0, 5)}`,
        statePatch: { start_time: slot.start_time },
      }));
    }

    if (!response.next_action) {
      return [
        { label: "Book appointment", message: "I want to book an appointment" },
        { label: "Check appointment status", message: "Is my appointment confirmed?" },
        { label: "Working hours", message: "What are your working hours?" },
        { label: "Services", message: "What services do you offer?" },
      ];
    }

    return [];
  }

  async function sendChat(cleanMessage, statePatch = {}) {
    if (!cleanMessage) return;

    setMessages((items) => [...items, { role: "user", text: cleanMessage }]);
    setMessage("");

    const nextState = { ...state, ...statePatch };
    setState(nextState);

    try {
      const response = await api.chat({ message: cleanMessage, state: nextState });
      const options = getChatOptions(response);
      setMessages((items) => [...items, { role: "bot", text: response.reply, options }]);
      if (response.next_action) {
        setState((current) => ({ ...current, last_next_action: response.next_action }));
      } else {
        setState({});
      }
    } catch (error) {
      setMessages((items) => [...items, { role: "bot", text: error.message }]);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    await sendChat(message.trim());
  }

  async function chooseOption(option) {
    await sendChat(option.message, option.statePatch || {});
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 flex h-[520px] w-[min(92vw,380px)] flex-col rounded-md border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-clinic-light text-clinic-blue">
                <Bot size={21} />
              </span>
              <div>
                <p className="font-bold text-clinic-blue">Clinic chatbot</p>
                <p className="text-xs text-slate-500">English support</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="icon-button" aria-label="Close chatbot">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`flex flex-col ${item.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[82%] rounded-md px-3 py-2 text-sm leading-6 ${item.role === "user" ? "bg-clinic-blue text-white" : "bg-white text-slate-700"}`}>
                  {item.text}
                </div>
                {item.options?.length > 0 && (
                  <div className="mt-2 flex max-w-[92%] flex-wrap gap-2">
                    {item.options.map((option) => (
                      <button
                        key={`${index}-${option.label}`}
                        type="button"
                        onClick={() => chooseOption(option)}
                        className="rounded-md border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-clinic-blue hover:border-clinic-blue"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-200 p-3">
            <input value={message} onChange={(event) => setMessage(event.target.value)} className="input" placeholder="Type your message..." />
            <button type="submit" className="icon-button bg-clinic-blue text-white" aria-label="Send message">
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-14 w-14 items-center justify-center rounded-full bg-clinic-blue text-white shadow-lg" aria-label="Open chatbot">
        <MessageCircle size={25} />
      </button>
    </div>
  );
}

function getEmptyTreatmentForm() {
  return {
    patient_name: "",
    patient_phone: "",
    service_id: "",
    doctor_id: "",
    base_price: "",
    paid_amount: "0",
    treatment_datetime: getCurrentDateTimeInputValue(),
    notes: "",
  };
}

function SecretaryPage({ navigate, doctors, services }) {
  const [records, setRecords] = useState(fallbackTreatmentRecords);
  const [form, setForm] = useState(getEmptyTreatmentForm);
  const [editingId, setEditingId] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [dateFilter, setDateFilter] = useState({ mode: "today", from: "", to: "" });
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [token] = useState(() => window.localStorage.getItem("clinic_token") || "");
  const [user] = useState(() => {
    const storedUser = window.localStorage.getItem("clinic_user");
    if (!storedUser) return null;
    try {
      return JSON.parse(storedUser);
    } catch {
      return null;
    }
  });

  const isAdminManager = user?.role === ROLE_ADMIN_DOCTOR;
  const isDoctor = user?.role === ROLE_DOCTOR;
  const currentDoctor = useMemo(() => {
    if (!isDoctor) return null;
    const userDoctorId = user?.doctor_id ? Number(user.doctor_id) : null;
    return (
      doctors.find((doctor) => userDoctorId && Number(doctor.id) === userDoctorId) ||
      doctors.find((doctor) => doctor.email && user?.email && doctor.email.toLowerCase() === user.email.toLowerCase()) ||
      doctors.find((doctor) => doctor.name && user?.name && doctor.name.toLowerCase() === user.name.toLowerCase()) ||
      null
    );
  }, [doctors, isDoctor, user]);
  const currentDoctorId = currentDoctor?.id ?? user?.doctor_id;
  const availableDoctors = isDoctor ? (currentDoctor ? [currentDoctor] : []) : doctors;
  const remainingAmount = toMoneyNumber(form.base_price) - toMoneyNumber(form.paid_amount);
  const editingRecord = records.find((record) => Number(record.id) === Number(editingId));
  const selectedServiceExists = services.some((service) => Number(service.id) === Number(form.service_id));
  const selectedDoctorExists = availableDoctors.some((doctor) => Number(doctor.id) === Number(form.doctor_id));

  const roleFilteredRecords = useMemo(() => {
    if (!isDoctor) return records;
    return records.filter((record) => {
      if (currentDoctorId && Number(record.doctor_id) === Number(currentDoctorId)) return true;
      return currentDoctor?.name && record.doctor_name?.toLowerCase() === currentDoctor.name.toLowerCase();
    });
  }, [currentDoctor, currentDoctorId, isDoctor, records]);

  const selectedDateRange = useMemo(() => {
    if (dateFilter.from || dateFilter.to) {
      return { start: dateFilter.from, end: dateFilter.to };
    }
    return getSecretaryDateModeRange(dateFilter.mode);
  }, [dateFilter]);

  const filteredRecords = useMemo(
    () => roleFilteredRecords.filter((record) => isDateWithinRange(record.treatment_datetime, selectedDateRange)),
    [roleFilteredRecords, selectedDateRange],
  );

  const summary = useMemo(
    () => ({
      totalBasePrice: filteredRecords.reduce((sum, record) => sum + toMoneyNumber(record.base_price), 0),
      totalPaid: filteredRecords.reduce((sum, record) => sum + toMoneyNumber(record.paid_amount), 0),
      totalRemaining: filteredRecords.reduce((sum, record) => sum + toMoneyNumber(record.remaining_amount), 0),
      recordCount: filteredRecords.length,
    }),
    [filteredRecords],
  );

  async function refreshRecords() {
    const data = await api.getTreatmentRecords(token);
    setRecords(data);
  }

  useEffect(() => {
    refreshRecords().catch((error) => setFeedback(error.message));
  }, [token]);

  useEffect(() => {
    if (!isDoctor || editingId || !currentDoctorId) return;
    setForm((current) => (current.doctor_id ? current : { ...current, doctor_id: String(currentDoctorId) }));
  }, [currentDoctorId, editingId, isDoctor]);

  function setSecretaryDateMode(mode) {
    setDateFilter({ mode, from: "", to: "" });
  }

  function setCustomDateFilter(field, value) {
    setDateFilter((current) => ({ ...current, mode: "custom", [field]: value }));
  }

  function getServiceDefaultPrice(serviceId) {
    const service = services.find((item) => Number(item.id) === Number(serviceId));
    return service?.price_min ?? service?.price_max ?? "";
  }

  function updateService(serviceId) {
    setForm((current) => ({
      ...current,
      service_id: serviceId,
      base_price: getServiceDefaultPrice(serviceId) || current.base_price,
    }));
  }

  function validateTreatmentForm() {
    if (!form.patient_name.trim()) return "Patient name is required.";
    if (!editingId && !form.service_id) return "Service is required.";
    if (!editingId && !form.doctor_id) return "Treating doctor is required.";
    if (!Number.isFinite(Number(form.base_price)) || Number(form.base_price) < 0) return "Base price must be a valid non-negative number.";
    if (!Number.isFinite(Number(form.paid_amount)) || Number(form.paid_amount) < 0) return "Paid amount must be a valid non-negative number.";
    if (Number(form.paid_amount) > Number(form.base_price)) return "Paid amount cannot exceed base price.";
    return "";
  }

  function treatmentPayload() {
    const selectedDoctorId = isDoctor && currentDoctorId ? currentDoctorId : form.doctor_id;
    const payload = {
      patient_name: form.patient_name,
      patient_phone: form.patient_phone,
      base_price: form.base_price,
      paid_amount: form.paid_amount,
      treatment_datetime: form.treatment_datetime,
      notes: form.notes,
    };
    if (form.service_id) payload.service_id = Number(form.service_id);
    if (selectedDoctorId) payload.doctor_id = Number(selectedDoctorId);
    return payload;
  }

  function resetTreatmentForm() {
    setEditingId(null);
    setForm(getEmptyTreatmentForm());
  }

  async function saveTreatmentRecord(event) {
    event.preventDefault();
    const validationError = validateTreatmentForm();
    if (validationError) {
      setFeedback(validationError);
      return;
    }

    setFeedback("Saving treatment record...");
    try {
      if (editingId) {
        await api.updateTreatmentRecord(editingId, treatmentPayload(), token);
        setFeedback("Treatment record updated.");
      } else {
        await api.createTreatmentRecord(treatmentPayload(), token);
        setFeedback("Treatment record added.");
      }
      resetTreatmentForm();
      await refreshRecords();
    } catch (error) {
      setFeedback(error.message);
    }
  }

  function startEditTreatment(record) {
    setEditingId(record.id);
    setForm({
      patient_name: record.patient_name,
      patient_phone: record.patient_phone || "",
      service_id: services.some((service) => Number(service.id) === Number(record.service_id)) ? record.service_id : "",
      doctor_id: availableDoctors.some((doctor) => Number(doctor.id) === Number(record.doctor_id)) ? record.doctor_id : "",
      base_price: record.base_price,
      paid_amount: record.paid_amount,
      treatment_datetime: toDateTimeInputValue(record.treatment_datetime),
      notes: record.notes || "",
    });
  }

  async function deleteTreatment(recordId) {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    setFeedback("Deleting treatment record...");
    try {
      await api.deleteTreatmentRecord(recordId, token);
      setRecords((current) => current.filter((record) => Number(record.id) !== Number(recordId)));
      setFeedback("Treatment record deleted.");
      await refreshRecords();
    } catch (error) {
      setFeedback(error.message);
    }
  }

  async function markFullyPaid(record) {
    setFeedback("Updating payment...");
    try {
      await api.updateTreatmentRecord(record.id, { paid_amount: record.base_price }, token);
      setFeedback("Record marked as fully paid.");
      await refreshRecords();
    } catch (error) {
      setFeedback(error.message);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3 text-clinic-blue">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-clinic-light">
              <Stethoscope size={22} />
            </span>
            <span className="text-lg font-bold">Chaam Dental Centre</span>
          </a>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate("/admin")} className="btn-secondary">
              Dashboard
            </button>
            <button type="button" onClick={() => navigate("/")} className="btn-secondary">
              Patient site
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase text-clinic-gold">Secretary</p>
          <div className="mt-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <h1 className="text-3xl font-bold text-clinic-blue">Treatment and payment records</h1>
            <button type="button" onClick={() => setShowAppointmentForm((value) => !value)} className="btn-primary justify-center">
              <CalendarCheck size={18} />
              New Appointment
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-600">Record patient treatment details after the visit and track payment status.</p>
        </div>

        {showAppointmentForm && (
          <div className="mb-6">
            <ManualAppointmentForm
              doctors={doctors}
              services={services}
              token={token}
              user={user}
              title="New Appointment"
              onCancel={() => setShowAppointmentForm(false)}
              onCreated={(appointment) => {
                setFeedback(`Appointment created for ${appointment.patient_name}.`);
                setShowAppointmentForm(false);
              }}
            />
          </div>
        )}

        <div className="mb-6 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {SECRETARY_DATE_FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSecretaryDateMode(id)}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                  dateFilter.mode === id && !dateFilter.from && !dateFilter.to ? "bg-clinic-blue text-white" : "bg-slate-100 text-slate-700 hover:bg-clinic-light"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <Field label="From date">
              <input className="input" type="date" value={dateFilter.from} onChange={(event) => setCustomDateFilter("from", event.target.value)} />
            </Field>
            <Field label="To date">
              <input className="input" type="date" value={dateFilter.to} onChange={(event) => setCustomDateFilter("to", event.target.value)} />
            </Field>
            <div className="flex items-end">
              <button type="button" onClick={() => setSecretaryDateMode("today")} className="btn-secondary">
                Reset
              </button>
            </div>
          </div>
        </div>

        {isAdminManager && (
          <div className="mb-6 grid gap-4 md:grid-cols-4">
            <Metric value={formatMoney(summary.totalPaid)} label="Total paid" />
            <Metric value={formatMoney(summary.totalRemaining)} label="Total remaining" />
            <Metric value={formatMoney(summary.totalBasePrice)} label="Total treatment value" />
            <Metric value={summary.recordCount} label="Treatment records" />
          </div>
        )}

        <form onSubmit={saveTreatmentRecord} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-clinic-blue">New Treatment Record</h2>
              {feedback && <p className="mt-2 text-sm text-slate-600">{feedback}</p>}
            </div>
            {editingId && (
              <button type="button" onClick={resetTreatmentForm} className="btn-secondary">
                Cancel edit
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Patient name">
              <input className="input" value={form.patient_name} onChange={(event) => setForm({ ...form, patient_name: event.target.value })} required />
            </Field>
            <Field label="Patient phone">
              <input className="input" value={form.patient_phone} onChange={(event) => setForm({ ...form, patient_phone: event.target.value })} />
            </Field>
            <Field label="Service / treatment">
              <select className="input" value={form.service_id} onChange={(event) => updateService(event.target.value)} required={!editingId}>
                <option value="">{editingId && editingRecord && !selectedServiceExists ? "Keep saved service" : "Choose service"}</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
              {editingId && editingRecord && !selectedServiceExists && (
                <p className="text-xs font-normal text-slate-500">Saved service: {editingRecord.service_name}</p>
              )}
            </Field>
            <Field label="Treating doctor">
              <select className="input" value={form.doctor_id} onChange={(event) => setForm({ ...form, doctor_id: event.target.value })} required={!editingId} disabled={isDoctor && Boolean(currentDoctorId)}>
                <option value="">{editingId && editingRecord && !selectedDoctorExists ? "Keep saved doctor" : "Choose doctor"}</option>
                {availableDoctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name}
                  </option>
                ))}
              </select>
              {editingId && editingRecord && !selectedDoctorExists && (
                <p className="text-xs font-normal text-slate-500">Saved doctor: {editingRecord.doctor_name}</p>
              )}
            </Field>
            <Field label="Base price">
              <input className="input" type="number" min="0" step="0.01" value={form.base_price} onChange={(event) => setForm({ ...form, base_price: event.target.value })} required />
            </Field>
            <Field label="Paid amount">
              <input className="input" type="number" min="0" step="0.01" value={form.paid_amount} onChange={(event) => setForm({ ...form, paid_amount: event.target.value })} required />
            </Field>
            <Field label="Remaining amount">
              <input className="input bg-slate-50" value={Number.isFinite(remainingAmount) ? formatMoney(remainingAmount) : "0.00"} readOnly />
            </Field>
            <Field label="Date and time">
              <input className="input" type="datetime-local" value={form.treatment_datetime} onChange={(event) => setForm({ ...form, treatment_datetime: event.target.value })} required />
            </Field>
            <label className="grid gap-2 text-sm font-semibold text-clinic-blue md:col-span-2 lg:col-span-4">
              Notes
              <textarea className="input min-h-24" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <button type="submit" className="btn-primary">
              {editingId ? "Update Record" : "Save Record"}
            </button>
          </div>
        </form>

        <div className="mt-8 overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
            <thead>
              <tr className="bg-clinic-light text-[11px] uppercase tracking-wide text-clinic-blue">
                <th className="px-3 py-3">Patient</th>
                <th className="px-3 py-3">Service</th>
                <th className="px-3 py-3">Base price</th>
                <th className="px-3 py-3">Paid</th>
                <th className="px-3 py-3">Remaining</th>
                <th className="px-3 py-3">Date/time</th>
                <th className="px-3 py-3">Doctor</th>
                <th className="px-3 py-3">Notes</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record, index) => (
                <tr key={record.id} className={`border-b border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}`}>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-clinic-blue">{record.patient_name}</p>
                    <p className="text-slate-500">{record.patient_phone || ""}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{record.service_name}</td>
                  <td className="px-3 py-3">{formatMoney(record.base_price)}</td>
                  <td className="px-3 py-3">{formatMoney(record.paid_amount)}</td>
                  <td className="px-3 py-3 font-semibold text-clinic-blue">{formatMoney(record.remaining_amount)}</td>
                  <td className="px-3 py-3">
                    <ClosedDayDate value={record.treatment_datetime}>{toDateTimeInputValue(record.treatment_datetime).replace("T", " ")}</ClosedDayDate>
                  </td>
                  <td className="px-3 py-3">{record.doctor_name}</td>
                  <td className="px-3 py-3">{record.notes || "-"}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => startEditTreatment(record)} className="btn-secondary px-3 py-1.5 text-xs">
                        Edit
                      </button>
                      {toMoneyNumber(record.remaining_amount) > 0 && (
                        <button type="button" onClick={() => markFullyPaid(record)} className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">
                          Paid
                        </button>
                      )}
                      <button type="button" onClick={() => deleteTreatment(record.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-red-200 hover:text-red-700" aria-label="Delete treatment record" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRecords.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={9}>
                    No treatment records found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function AdminPage({ navigate, publicDoctors, publicServices, onPublicDataChanged }) {
  const [activeView, setActiveView] = useState("dashboard");
  const [token, setToken] = useState(() => window.localStorage.getItem("clinic_token") || "");
  const [user, setUser] = useState(() => {
    const storedUser = window.localStorage.getItem("clinic_user");
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const [dashboardDoctors, setDashboardDoctors] = useState(publicDoctors);
  const [dashboardServices, setDashboardServices] = useState(publicServices);
  const [loginStatus, setLoginStatus] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });

  const refreshDashboardData = useCallback(async () => {
    if (!token || !user) {
      setDashboardDoctors(publicDoctors);
      setDashboardServices(publicServices);
      return;
    }

    if (user.role === ROLE_ADMIN_DOCTOR) {
      const [doctorData, serviceData] = await Promise.all([
        api.getAdminDoctors(token),
        api.getAdminServices(token),
      ]);
      setDashboardDoctors(doctorData);
      setDashboardServices(serviceData);
      return;
    }

    const [doctorData, serviceData] = await Promise.all([api.getDoctors(), api.getServices()]);
    setDashboardDoctors(doctorData);
    setDashboardServices(serviceData);
  }, [publicDoctors, publicServices, token, user]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    api
      .getMe(token)
      .then(setUser)
      .catch(() => {
      window.localStorage.removeItem("clinic_token");
      window.localStorage.removeItem("clinic_user");
      setToken("");
      setUser(null);
      });
  }, [token]);

  useEffect(() => {
    refreshDashboardData().catch(() => {
      setDashboardDoctors(publicDoctors);
      setDashboardServices(publicServices);
    });
  }, [publicDoctors, publicServices, refreshDashboardData]);

  function logout() {
    setToken("");
    setUser(null);
    window.localStorage.removeItem("clinic_token");
    window.localStorage.removeItem("clinic_user");
    setLoginForm({ email: "", password: "" });
    setLoginStatus("Logged out.");
    setActiveView("dashboard");
  }

  async function login(event) {
    event.preventDefault();
    setLoginStatus("Signing in...");
    try {
      const data = await api.login({
        email: loginForm.email,
        password: loginForm.password,
      });
      setToken(data.access_token);
      setUser(data.user);
      window.localStorage.setItem("clinic_token", data.access_token);
      window.localStorage.setItem("clinic_user", JSON.stringify(data.user));
      setLoginForm((current) => ({ ...current, password: "" }));
      setLoginStatus("");
      setActiveView("appointments");
    } catch (error) {
      setLoginStatus(error.message);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3 text-clinic-blue">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-clinic-light">
              <Stethoscope size={22} />
            </span>
            <span className="text-lg font-bold">Chaam Dental Centre</span>
          </a>
          <a href="/" className="btn-secondary">
            Patient site
          </a>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase text-clinic-gold">Dashboard</p>
          <h1 className="mt-2 text-3xl font-bold text-clinic-blue">
            {user?.role === ROLE_DOCTOR ? "Doctor dashboard" : "Admin dashboard"}
          </h1>
          {user && (
            <p className="mt-2 text-sm text-slate-600">
              Signed in as {user.name} ({user.role})
            </p>
          )}
        </div>
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <AdminLogin
            token={token}
            user={user}
            loginForm={loginForm}
            loginStatus={loginStatus}
            onLogin={login}
            onLogout={logout}
            setLoginForm={setLoginForm}
          />
          {token && user ? (
            <AdminDashboard
              token={token}
              user={user}
              activeView={activeView}
              setActiveView={setActiveView}
              publicDoctors={dashboardDoctors}
              publicServices={dashboardServices}
              navigate={navigate}
              onDashboardDataChanged={refreshDashboardData}
              onPublicDataChanged={onPublicDataChanged}
            />
          ) : (
            <div className="rounded-md border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold text-clinic-blue">Protected dashboard</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Please log in to view appointments and dashboard tools.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function AdminLogin({ token, user, loginForm, loginStatus, onLogin, onLogout, setLoginForm }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-5">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-clinic-light text-clinic-blue">
          <Lock size={21} />
        </span>
        <div>
          <h3 className="font-bold text-clinic-blue">Dashboard login</h3>
          <p className="text-xs text-slate-500">JWT protected</p>
        </div>
      </div>
      <form onSubmit={onLogin} className="grid gap-4">
        <Field label="Email">
          <input
            name="email"
            type="email"
            value={loginForm.email}
            onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
            className="input"
            placeholder="admin@chaam-dental.com"
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Password">
          <input
            name="password"
            type="password"
            value={loginForm.password}
            onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
            className="input"
            autoComplete="current-password"
            required
          />
        </Field>
        <button type="submit" className="btn-primary justify-center">
          <Lock size={18} />
          Login
        </button>
      </form>
      {loginStatus && <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">{loginStatus}</p>}
      {token && user && (
        <div className="mt-4 grid gap-3 rounded-md bg-green-50 p-3">
          <p className="text-sm text-green-700">Logged in as {user.role}.</p>
          <button type="button" onClick={onLogout} className="btn-secondary justify-center bg-white">
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

function AdminDashboard({
  token,
  user,
  activeView,
  setActiveView,
  publicDoctors,
  publicServices,
  navigate,
  onDashboardDataChanged,
  onPublicDataChanged,
}) {
  const tabs =
    user.role === ROLE_ADMIN_DOCTOR
      ? [
          ["dashboard", "Dashboard"],
          ["new-appointment", "New Appointment"],
          ["appointments", "Appointments"],
          ["doctors", "Doctors"],
          ["services", "Services"],
          ["faqs", "FAQs"],
          ["blocked", "Blocked Slots"],
        ]
      : [
          ["dashboard", "Dashboard"],
          ["new-appointment", "New Appointment"],
          ["appointments", "My Appointments"],
          ["blocked", "My Blocked Slots"],
        ];

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveView(id)}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${activeView === id ? "bg-clinic-blue text-white" : "bg-slate-100 text-slate-700"}`}
          >
            {label}
          </button>
        ))}
        <a
          href="/secretary"
          onClick={(event) => {
            event.preventDefault();
            navigate("/secretary");
          }}
          className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-clinic-gold transition hover:bg-amber-100"
        >
          Secretary
        </a>
      </div>
      <div className="p-5">
        {activeView === "dashboard" && <DashboardOverview user={user} />}
        {activeView === "new-appointment" && (
          <ManualAppointmentForm
            doctors={publicDoctors}
            services={publicServices}
            token={token}
            user={user}
            title={user.role === ROLE_DOCTOR ? "New Appointment for My Schedule" : "New Appointment"}
            onCreated={() => setActiveView("appointments")}
          />
        )}
        {activeView === "appointments" && (
          <AdminTable
            title={user.role === ROLE_ADMIN_DOCTOR ? "Appointments" : "My Appointments"}
            token={token}
            user={user}
            doctors={publicDoctors}
            services={publicServices}
            fallback={fallbackAppointments}
          />
        )}
        {activeView === "doctors" && user.role === ROLE_ADMIN_DOCTOR && (
          <DoctorsManagement
            token={token}
            user={user}
            fallback={publicDoctors.length ? publicDoctors : fallbackDoctors}
            onDashboardDataChanged={onDashboardDataChanged}
            onPublicDataChanged={onPublicDataChanged}
          />
        )}
        {activeView === "services" && user.role === ROLE_ADMIN_DOCTOR && (
          <ServicesManagement
            token={token}
            fallback={publicServices.length ? publicServices : fallbackServices}
            onDashboardDataChanged={onDashboardDataChanged}
            onPublicDataChanged={onPublicDataChanged}
          />
        )}
        {activeView === "faqs" && user.role === ROLE_ADMIN_DOCTOR && <AdminCards title="FAQ Management" token={token} loader={api.getAdminFaqs} fallback={fallbackFaqs} />}
        {activeView === "blocked" && (
          <BlockedSlotsManagement
            token={token}
            user={user}
            doctors={publicDoctors}
            fallback={fallbackBlockedSlots}
          />
        )}
      </div>
    </div>
  );
}

function DashboardOverview({ user }) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <LayoutDashboard className="text-clinic-gold" size={24} />
        <h3 className="text-xl font-bold text-clinic-blue">Dashboard overview</h3>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Metric value={user.role === ROLE_ADMIN_DOCTOR ? "All" : "Own"} label="Appointment view" />
        <Metric value={user.role} label="Role" />
        <Metric value={user.doctor_id || "-"} label="Doctor link" />
        <Metric value="JWT" label="Security" />
      </div>
    </div>
  );
}

function AdminTable({ title, token, user, doctors, services, fallback }) {
  const [items, setItems] = useState(fallback);
  const [note, setNote] = useState("");
  const [adminMessages, setAdminMessages] = useState({});
  const [feedback, setFeedback] = useState("");
  const [filters, setFilters] = useState({
    doctor_id: "",
    appointment_date: "",
    date_mode: "all",
    status: "",
    service_id: "",
  });

  function getAppointmentRequestFilters() {
    const requestFilters = {
      doctor_id: filters.doctor_id,
      status: filters.status,
      service_id: filters.service_id,
    };

    if (filters.appointment_date) {
      requestFilters.appointment_date = filters.appointment_date;
    } else if (filters.date_mode === "today") {
      requestFilters.appointment_date = getLocalDateValue();
    }

    return requestFilters;
  }

  function applyDateModeFilter(appointments) {
    if (filters.appointment_date || filters.date_mode === "all") return appointments;

    const range = getDateModeRange(filters.date_mode);
    if (!range) return appointments;

    return appointments.filter((item) => item.appointment_date >= range.start && item.appointment_date <= range.end);
  }

  function setDateMode(dateMode) {
    setFilters({
      ...filters,
      date_mode: dateMode,
      appointment_date: dateMode === "today" ? getLocalDateValue() : "",
    });
  }

  function setManualAppointmentDate(appointmentDate) {
    setFilters({
      ...filters,
      appointment_date: appointmentDate,
      date_mode: appointmentDate ? "custom" : "all",
    });
  }

  async function refreshItems() {
    if (!token) {
      setItems(fallback);
      setNote("Showing sample data until admin API login is available.");
      return;
    }

    const data = await api.getAdminAppointmentsFiltered(token, getAppointmentRequestFilters());
    setItems(applyDateModeFilter(data));
    setNote("");
  }

  useEffect(() => {
    refreshItems().catch((error) => setNote(error.message));
  }, [fallback, token, filters]);

  async function updateStatus(appointmentId, status) {
    if (!token) {
      setFeedback("Please log in before updating appointments.");
      return;
    }

    setFeedback("Updating appointment...");
    try {
      const updatedAppointment = await api.updateAdminAppointment(token, appointmentId, {
        status,
        admin_message: adminMessages[appointmentId] || "",
      });
      setFeedback(`Appointment marked as ${status}.`);
      setItems((current) =>
        current.map((item) => (Number(item.id) === Number(appointmentId) ? updatedAppointment : item)),
      );
      await refreshItems();
    } catch (error) {
      setFeedback(error.message);
    }
  }

  async function deleteAppointment(appointmentId) {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    setFeedback("Deleting appointment...");
    try {
      await api.deleteAdminAppointment(token, appointmentId);
      setItems((current) => current.filter((item) => Number(item.id) !== Number(appointmentId)));
      setFeedback("Appointment deleted.");
      await refreshItems();
    } catch (error) {
      setFeedback(error.message);
    }
  }

  function renderStatusActions(item) {
    if (item.status === "completed") {
      return null;
    }

    const isAccepted = item.status === "confirmed";
    const isRejected = item.status === "rejected" || item.status === "cancelled";

    return (
      <>
        {!isAccepted && (
          <button
            type="button"
            onClick={() => updateStatus(item.id, "confirmed")}
            className="rounded-md bg-green-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-green-700"
          >
            Accept
          </button>
        )}
        {!isRejected && (
          <button
            type="button"
            onClick={() => updateStatus(item.id, "rejected")}
            className="rounded-md bg-red-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-red-700"
          >
            Reject
          </button>
        )}
      </>
    );
  }

  const selectedDateRange = filters.appointment_date ? null : getDateModeRange(filters.date_mode);

  return (
    <div>
      <h3 className="text-center text-xl font-bold text-clinic-blue">{title}</h3>
      {note && <p className="mt-2 text-sm text-slate-600">{note}</p>}
      {feedback && <p className="mt-3 rounded-md bg-clinic-light px-4 py-3 text-sm text-clinic-blue">{feedback}</p>}
      <div className="mt-5 rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {APPOINTMENT_DATE_FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setDateMode(id)}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                filters.date_mode === id ? "bg-clinic-blue text-white" : "bg-slate-100 text-slate-700 hover:bg-clinic-light"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {selectedDateRange && (
          <div className="mb-4 grid gap-3 rounded-md border border-blue-100 bg-blue-50/50 p-3 sm:grid-cols-2">
            <Field label="From">
              <input className="input bg-white" value={selectedDateRange.start} readOnly />
            </Field>
            <Field label="To">
              <input className="input bg-white" value={selectedDateRange.end} readOnly />
            </Field>
          </div>
        )}
        {user.role === ROLE_ADMIN_DOCTOR ? (
          <div className="grid gap-3 md:grid-cols-4">
          <Field label="Doctor">
            <select className="input" value={filters.doctor_id} onChange={(event) => setFilters({ ...filters, doctor_id: event.target.value })}>
              <option value="">All doctors</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={filters.appointment_date} onChange={(event) => setManualAppointmentDate(event.target.value)} />
          </Field>
          <Field label="Status">
            <select className="input" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              {APPOINTMENT_DECISIONS.map(([value, label]) => (
                <option key={value || "all"} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Service">
            <select className="input" value={filters.service_id} onChange={(event) => setFilters({ ...filters, service_id: event.target.value })}>
              <option value="">All services</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </Field>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Date">
              <input className="input" type="date" value={filters.appointment_date} onChange={(event) => setManualAppointmentDate(event.target.value)} />
            </Field>
            <Field label="Status">
              <select className="input" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                {APPOINTMENT_DECISIONS.map(([value, label]) => (
                  <option key={value || "all"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Service">
              <select className="input" value={filters.service_id} onChange={(event) => setFilters({ ...filters, service_id: event.target.value })}>
                <option value="">All services</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>
      <div className="mt-5 overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
          <thead>
            <tr className="bg-clinic-light text-[11px] uppercase tracking-wide text-clinic-blue">
              <th className="px-3 py-3 font-bold">Patient</th>
              <th className="px-3 py-3 font-bold">Doctor</th>
              <th className="px-3 py-3 font-bold">Service</th>
              <th className="px-3 py-3 font-bold">Email</th>
              <th className="px-3 py-3 font-bold">Phone</th>
              <th className="px-3 py-3 font-bold">Date</th>
              <th className="px-3 py-3 font-bold">Time</th>
              <th className="px-3 py-3 font-bold">Status</th>
              <th className="px-3 py-3 font-bold">Actions</th>
              <th className="px-3 py-3 font-bold">Message</th>
              <th className="px-3 py-3 font-bold">Delete</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id} className={`border-b border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/70"} hover:bg-blue-50/40`}>
                <td className="px-3 py-3 font-semibold text-clinic-blue">{item.patient_name}</td>
                <td className="px-3 py-3 text-slate-700">{item.doctor_name || doctors.find((doctor) => Number(doctor.id) === Number(item.doctor_id))?.name || `Doctor #${item.doctor_id}`}</td>
                <td className="px-3 py-3 text-slate-700">{item.service_name || services.find((service) => Number(service.id) === Number(item.service_id))?.name || `Service #${item.service_id}`}</td>
                <td className="px-3 py-3 text-slate-600">{item.patient_email}</td>
                <td className="px-3 py-3 text-slate-600">{item.patient_phone}</td>
                <td className="px-3 py-3 text-slate-700">
                  <ClosedDayDate value={item.appointment_date}>{item.appointment_date}</ClosedDayDate>
                </td>
                <td className="px-3 py-3 text-slate-700">
                  {item.start_time?.slice(0, 5)}-{item.end_time?.slice(0, 5)}
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${statusBadgeClass(item.status)}`}>
                    {formatStatusLabel(item.status)}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex min-w-32 flex-wrap items-center gap-1.5">
                    {renderStatusActions(item)}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <input
                    value={adminMessages[item.id] || ""}
                    onChange={(event) =>
                      setAdminMessages((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    className="input min-w-56"
                    placeholder="Optional message"
                  />
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => deleteAppointment(item.id)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:text-red-700"
                    aria-label="Delete appointment"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={11}>
                  No appointments found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DoctorsManagement({ token, user, fallback, onDashboardDataChanged, onPublicDataChanged }) {
  const [items, setItems] = useState(fallback);
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [contactFieldsUnlocked, setContactFieldsUnlocked] = useState(false);
  const [form, setForm] = useState({
    name: "",
    specialization: "General Dentist",
    email: "",
    phone: "",
    password: "",
    active: true,
  });

  const specializationOptions = useMemo(() => {
    const existing = items.map((doctor) => doctor.specialization).filter(Boolean);
    return Array.from(
      new Set([
        "General Dentist",
        "Implant Specialist",
        "Root Canal Specialist",
        "Cosmetic Dentist",
        "Emergency Dentist",
        ...existing,
      ]),
    );
  }, [items]);

  async function refreshDoctors() {
    const data = await api.getAdminDoctors(token);
    setItems(data);
  }

  useEffect(() => {
    if (!token) {
      setItems(fallback);
      return;
    }
    refreshDoctors().catch((error) => setNote(error.message));
  }, [fallback, token]);

  function startEdit(doctor) {
    setEditingId(doctor.id);
    setContactFieldsUnlocked(true);
    setForm({
      name: doctor.name,
      specialization: doctor.specialization,
      email: doctor.email || "",
      phone: doctor.phone || "",
      password: "",
      active: doctor.active,
    });
  }

  function resetForm() {
    setEditingId(null);
    setFormKey((current) => current + 1);
    setContactFieldsUnlocked(false);
    setForm({
      name: "",
      specialization: specializationOptions[0] || "General Dentist",
      email: "",
      phone: "",
      password: "",
      active: true,
    });
  }

  async function saveDoctor(event) {
    event.preventDefault();
    setNote("Saving doctor...");
    try {
      const payload = { ...form };
      if (editingId && !payload.password) {
        delete payload.password;
      }

      if (editingId) {
        await api.updateAdminDoctor(token, editingId, payload);
        setNote("Doctor updated.");
      } else {
        await api.createAdminDoctor(token, payload);
        setNote("Doctor added.");
      }
      resetForm();
      await refreshDoctors();
      await onDashboardDataChanged?.();
      await onPublicDataChanged?.();
    } catch (error) {
      setNote(error.message);
    }
  }

  async function deleteDoctor(doctorId) {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    setNote("Deleting doctor...");
    try {
      await api.deleteAdminDoctor(token, doctorId);
      setItems((current) => current.filter((doctor) => Number(doctor.id) !== Number(doctorId)));
      setNote("Doctor deleted.");
      await refreshDoctors();
      await onDashboardDataChanged?.();
      await onPublicDataChanged?.();
    } catch (error) {
      setNote(error.message);
    }
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-bold text-clinic-blue">
            {user.role === ROLE_ADMIN_DOCTOR ? "Doctors management" : "Clinic doctors"}
          </h3>
          {note && <p className="mt-2 text-sm text-slate-600">{note}</p>}
        </div>
      </div>

      {user.role === ROLE_ADMIN_DOCTOR && (
        <form
          key={editingId ? `edit-doctor-${editingId}` : `add-doctor-${formKey}`}
          onSubmit={saveDoctor}
          autoComplete="off"
          className="mt-5 grid gap-3 rounded-md border border-slate-200 bg-clinic-light p-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto_auto]"
        >
          <Field label="Doctor name">
            <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="Specialization">
            <select className="input" value={form.specialization} onChange={(event) => setForm({ ...form, specialization: event.target.value })}>
              {specializationOptions.map((specialization) => (
                <option key={specialization} value={specialization}>
                  {specialization}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Email">
            <input
              className="input"
              type="text"
              inputMode="email"
              name={editingId ? "doctor_saved_contact_email" : `new_doctor_contact_email_${formKey}`}
              autoComplete="new-email"
              readOnly={!editingId && !contactFieldsUnlocked}
              onFocus={() => setContactFieldsUnlocked(true)}
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="example@clinic.com"
            />
          </Field>
          <Field label="Phone">
            <input
              className="input"
              name={editingId ? "doctor_saved_contact_phone" : `new_doctor_contact_phone_${formKey}`}
              autoComplete="new-tel"
              readOnly={!editingId && !contactFieldsUnlocked}
              onFocus={() => setContactFieldsUnlocked(true)}
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="+49 ..."
            />
          </Field>
          <Field label={editingId ? "Password (optional)" : "Password"}>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required={!editingId}
              placeholder={editingId ? "Leave blank to keep current" : "Doctor login password"}
            />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-clinic-blue">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Active
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary justify-center">
              {editingId ? "Update" : "Add"}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="mt-5 grid gap-3">
        {items.map((doctor) => (
          <div key={doctor.id} className="rounded-md border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-sm">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="font-bold text-clinic-blue">{doctor.name}</p>
                <p className="mt-1 text-sm text-slate-600">{doctor.specialization}</p>
                <p className="mt-1 text-xs text-slate-500">Email: {doctor.email || "Not available"}</p>
                <p className="mt-1 text-xs text-slate-500">Phone: {doctor.phone || "Not available"}</p>
              </div>
              <div className="flex min-w-52 items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${doctor.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {doctor.active ? "Active" : "Inactive"}
                  </span>
                  {user.role === ROLE_ADMIN_DOCTOR && (
                    <button type="button" onClick={() => startEdit(doctor)} className="btn-secondary">
                      Edit
                    </button>
                  )}
                </div>
                {user.role === ROLE_ADMIN_DOCTOR && (
                  <button
                    type="button"
                    onClick={() => deleteDoctor(doctor.id)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-red-200 hover:text-red-700"
                    aria-label="Delete doctor"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockedSlotsManagement({ token, user, doctors, fallback }) {
  const [items, setItems] = useState(fallback);
  const [note, setNote] = useState("");
  const [form, setForm] = useState({
    doctor_id: doctors[0]?.id || "",
    date: "",
    start_time: "",
    end_time: "",
    reason: "",
  });

  async function refreshSlots() {
    const data = await api.getAdminBlockedSlots(token);
    setItems(data);
  }

  useEffect(() => {
    if (!token) {
      setItems(fallback);
      return;
    }
    refreshSlots().catch((error) => setNote(error.message));
  }, [fallback, token]);

  async function createSlot(event) {
    event.preventDefault();
    setNote("Saving blocked slot...");
    try {
      await api.createAdminBlockedSlot(token, {
        doctor_id: user.role === ROLE_ADMIN_DOCTOR ? Number(form.doctor_id) : undefined,
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        reason: form.reason || "Unavailable",
      });
      setForm({ doctor_id: doctors[0]?.id || "", date: "", start_time: "", end_time: "", reason: "" });
      setNote("Blocked slot saved.");
      await refreshSlots();
    } catch (error) {
      setNote(error.message);
    }
  }

  async function deleteSlot(slotId) {
    setNote("Removing blocked slot...");
    try {
      await api.deleteAdminBlockedSlot(token, slotId);
      setNote("Blocked slot removed.");
      await refreshSlots();
    } catch (error) {
      setNote(error.message);
    }
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-clinic-blue">
        {user.role === ROLE_ADMIN_DOCTOR ? "Blocked Slots" : "My Blocked Slots"}
      </h3>
      {note && <p className="mt-2 text-sm text-slate-600">{note}</p>}
      <form onSubmit={createSlot} className="mt-5 grid gap-3 rounded-md border border-slate-200 bg-clinic-light p-4 md:grid-cols-5">
        {user.role === ROLE_ADMIN_DOCTOR && (
          <Field label="Doctor">
            <select className="input" value={form.doctor_id} onChange={(event) => setForm({ ...form, doctor_id: event.target.value })} required>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Date">
          <input className="input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
        </Field>
        <Field label="Start">
          <input className="input" type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} required />
        </Field>
        <Field label="End">
          <input className="input" type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} required />
        </Field>
        <Field label="Reason">
          <input className="input" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Unavailable" />
        </Field>
        <div className="flex items-end">
          <button type="submit" className="btn-primary justify-center">
            Add
          </button>
        </div>
      </form>
      <div className="mt-5 grid gap-3">
        {items.map((slot) => (
          <div key={slot.id} className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <p className="font-bold text-clinic-blue">
                  <ClosedDayDate value={slot.date}>{slot.date}</ClosedDayDate> · {slot.start_time?.slice(0, 5)}-{slot.end_time?.slice(0, 5)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {doctors.find((doctor) => Number(doctor.id) === Number(slot.doctor_id))?.name || `Doctor #${slot.doctor_id}`} · {slot.reason}
                </p>
              </div>
              <button type="button" onClick={() => deleteSlot(slot.id)} className="rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServicesManagement({ token, fallback, onDashboardDataChanged, onPublicDataChanged }) {
  const [items, setItems] = useState(fallback);
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    duration_minutes: 30,
    price_min: "",
    price_max: "",
    active: true,
  });

  async function refreshServices() {
    const data = await api.getAdminServices(token);
    setItems(data);
  }

  useEffect(() => {
    if (!token) {
      setItems(fallback);
      return;
    }
    refreshServices().catch((error) => setNote(error.message));
  }, [fallback, token]);

  function servicePayload() {
    return {
      name: form.name,
      description: form.description,
      duration_minutes: Number(form.duration_minutes),
      price_min: form.price_min === "" ? null : form.price_min,
      price_max: form.price_max === "" ? null : form.price_max,
      active: form.active,
    };
  }

  function startEdit(service) {
    setEditingId(service.id);
    setForm({
      name: service.name,
      description: service.description || "",
      duration_minutes: service.duration_minutes,
      price_min: service.price_min ?? "",
      price_max: service.price_max ?? "",
      active: service.active,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      name: "",
      description: "",
      duration_minutes: 30,
      price_min: "",
      price_max: "",
      active: true,
    });
  }

  async function saveService(event) {
    event.preventDefault();
    setNote("Saving service...");
    try {
      if (editingId) {
        await api.updateAdminService(token, editingId, servicePayload());
        setNote("Service updated.");
      } else {
        await api.createAdminService(token, servicePayload());
        setNote("Service added.");
      }
      resetForm();
      await refreshServices();
      await onDashboardDataChanged?.();
      await onPublicDataChanged?.();
    } catch (error) {
      setNote(error.message);
    }
  }

  async function deleteService(serviceId) {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    setNote("Deleting service...");
    try {
      await api.deleteAdminService(token, serviceId);
      setItems((current) => current.filter((service) => Number(service.id) !== Number(serviceId)));
      setNote("Service deleted.");
      await refreshServices();
      await onDashboardDataChanged?.();
      await onPublicDataChanged?.();
    } catch (error) {
      setNote(error.message);
    }
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-bold text-clinic-blue">Services Management</h3>
          {note && <p className="mt-2 text-sm text-slate-600">{note}</p>}
        </div>
      </div>

      <form onSubmit={saveService} className="mt-5 grid gap-3 rounded-md border border-slate-200 bg-clinic-light p-4 md:grid-cols-2 lg:grid-cols-6">
        <Field label="Service name">
          <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </Field>
        <Field label="Description">
          <input className="input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </Field>
        <Field label="Duration">
          <input className="input" type="number" min="1" value={form.duration_minutes} onChange={(event) => setForm({ ...form, duration_minutes: event.target.value })} required />
        </Field>
        <Field label="Min price">
          <input className="input" type="number" min="0" step="0.01" value={form.price_min} onChange={(event) => setForm({ ...form, price_min: event.target.value })} />
        </Field>
        <Field label="Max price">
          <input className="input" type="number" min="0" step="0.01" value={form.price_max} onChange={(event) => setForm({ ...form, price_max: event.target.value })} />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-clinic-blue">
          <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          Active
        </label>
        <div className="flex items-end gap-2 md:col-span-2 lg:col-span-6">
          <button type="submit" className="btn-primary justify-center">
            {editingId ? "Update service" : "Add service"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="btn-secondary">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="mt-5 grid gap-3">
        {items.map((service) => (
          <div key={service.id} className="rounded-md border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-sm">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <p className="font-bold text-clinic-blue">{service.name}</p>
                <p className="mt-1 text-sm text-slate-600">{service.description || "No description set."}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {service.duration_minutes} minutes | Price: {formatValue(service.price_min)}-{formatValue(service.price_max)}
                </p>
              </div>
              <div className="flex min-w-52 items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${service.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {service.active ? "Active" : "Inactive"}
                  </span>
                  <button type="button" onClick={() => startEdit(service)} className="btn-secondary">
                    Edit
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => deleteService(service.id)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-red-200 hover:text-red-700"
                  aria-label="Delete service"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminCards({ title, token, loader, fallback }) {
  const [items, setItems] = useState(fallback);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!token) {
      setItems(fallback);
      setNote("Showing sample data until admin API endpoints are available.");
      return;
    }
    loader(token).then(setItems).catch((error) => setNote(error.message));
  }, [fallback, loader, token]);

  const fields = useMemo(() => {
    const first = items[0] || {};
    return Object.keys(first).filter((key) => key !== "id");
  }, [items]);

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-bold text-clinic-blue">{title}</h3>
          {note && <p className="mt-2 text-sm text-slate-600">{note}</p>}
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-slate-200 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              {fields.map((field) => (
                <div key={field}>
                  <p className="text-xs uppercase text-slate-500">{field.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{formatValue(item[field])}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">
            No items found.
          </div>
        )}
      </div>
    </div>
  );
}

function formatValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value || "Not set";
}

export default App;
