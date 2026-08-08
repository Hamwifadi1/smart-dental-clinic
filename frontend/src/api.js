const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const message = data?.detail || "The request could not be completed.";
    throw new Error(message);
  }

  return data;
}

export const api = {
  getServices: () => request("/api/services"),
  getDoctors: () => request("/api/doctors"),
  getAvailability: ({ doctorId, serviceId, date }) =>
    request(`/api/availability?doctor_id=${doctorId}&service_id=${serviceId}&date=${date}`),
  createAppointment: (payload, token) =>
    request("/api/appointments", {
      method: "POST",
      ...(token ? { token } : {}),
      body: JSON.stringify(payload),
    }),
  chat: (payload) =>
    request("/api/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  login: (payload) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getMe: (token) => request("/api/me", { token }),
  getAdminAppointments: (token) => request("/api/admin/appointments", { token }),
  getAdminAppointmentsFiltered: (token, filters = {}) => {
    const params = new URLSearchParams();
    if (filters.doctor_id) params.set("doctor_id", filters.doctor_id);
    if (filters.appointment_date) params.set("appointment_date", filters.appointment_date);
    if (filters.status) params.set("status", filters.status);
    if (filters.service_id) params.set("service_id", filters.service_id);
    const query = params.toString();
    return request(`/api/admin/appointments${query ? `?${query}` : ""}`, { token });
  },
  updateAdminAppointment: (token, appointmentId, payload) =>
    request(`/api/admin/appointments/${appointmentId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(payload),
    }),
  deleteAdminAppointment: (token, appointmentId) =>
    request(`/api/admin/appointments/${appointmentId}`, {
      method: "DELETE",
      token,
    }),
  getAdminDoctors: (token) => request("/api/admin/doctors", { token }),
  createAdminDoctor: (token, payload) =>
    request("/api/admin/doctors", {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),
  updateAdminDoctor: (token, doctorId, payload) =>
    request(`/api/admin/doctors/${doctorId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(payload),
    }),
  deleteAdminDoctor: (token, doctorId) =>
    request(`/api/admin/doctors/${doctorId}`, {
      method: "DELETE",
      token,
    }),
  getAdminServices: (token) => request("/api/admin/services", { token }),
  createAdminService: (token, payload) =>
    request("/api/admin/services", {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),
  updateAdminService: (token, serviceId, payload) =>
    request(`/api/admin/services/${serviceId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(payload),
    }),
  deleteAdminService: (token, serviceId) =>
    request(`/api/admin/services/${serviceId}`, {
      method: "DELETE",
      token,
    }),
  getTreatmentRecords: (token) => request("/api/secretary/treatment-records", token ? { token } : {}),
  createTreatmentRecord: (payload, token) =>
    request("/api/secretary/treatment-records", {
      method: "POST",
      ...(token ? { token } : {}),
      body: JSON.stringify(payload),
    }),
  updateTreatmentRecord: (recordId, payload, token) =>
    request(`/api/secretary/treatment-records/${recordId}`, {
      method: "PATCH",
      ...(token ? { token } : {}),
      body: JSON.stringify(payload),
    }),
  deleteTreatmentRecord: (recordId, token) =>
    request(`/api/secretary/treatment-records/${recordId}`, {
      method: "DELETE",
      ...(token ? { token } : {}),
    }),
  getAdminFaqs: (token) => request("/api/admin/faqs", { token }),
  getAdminBlockedSlots: (token) => request("/api/admin/blocked-slots", { token }),
  createAdminBlockedSlot: (token, payload) =>
    request("/api/admin/blocked-slots", {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),
  deleteAdminBlockedSlot: (token, slotId) =>
    request(`/api/admin/blocked-slots/${slotId}`, {
      method: "DELETE",
      token,
    }),
};
