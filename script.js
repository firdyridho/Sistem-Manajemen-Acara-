// Variabel global untuk database SQLite
let db;
let eventToDelete = null;
let SQL = null;
let sidebarCollapsed = false;

// DOM elements
const eventsContainer = document.getElementById("eventsContainer");
const statsContainer = document.getElementById("statsContainer");
const registrationsBody = document.getElementById("registrationsBody");
const createEventForm = document.getElementById("createEventForm");
const registrationForm = document.getElementById("registrationForm");
const sidebar = document.getElementById("sidebar");
const mainContent = document.getElementById("mainContent");
const splashScreen = document.getElementById("splashScreen");
const splashProgress = document.getElementById("splashProgress");
const sidebarIcon = document.getElementById("sidebarIcon");
const upcomingCount = document.getElementById("upcomingCount");
const ongoingCount = document.getElementById("ongoingCount");
const completedCount = document.getElementById("completedCount");
const upcomingEvents = document.getElementById("upcomingEvents");
const recentEvents = document.getElementById("recentEvents");

// Initialize the app
function initApp() {
  // Animate progress bar
  splashProgress.style.width = "100%";

  // Tampilkan splash screen selama 3 detik
  setTimeout(() => {
    splashScreen.style.opacity = "0";
    setTimeout(() => {
      splashScreen.style.display = "none";
    }, 500);
  }, 3000);

  initDatabase();

  // Form event listeners
  createEventForm.addEventListener("submit", handleCreateEvent);
  registrationForm.addEventListener("submit", handleRegistration);
}

// Initialize SQLite database
function initDatabase() {
  // Konfigurasi untuk SQL.js
  const config = {
    locateFile: (file) =>
      `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`,
  };

  // Inisialisasi SQL.js
  initSqlJs(config)
    .then(function (SQLModule) {
      SQL = SQLModule;

      // Coba muat database dari localStorage
      let databaseData = localStorage.getItem("event_management_db");

      if (databaseData) {
        // Konversi dari base64 ke Uint8Array
        const buffer = Uint8Array.from(atob(databaseData), (c) =>
          c.charCodeAt(0)
        );
        db = new SQL.Database(buffer);
        console.log("Database dimuat dari localStorage");
      } else {
        // Buat database baru
        db = new SQL.Database();
        console.log("Database baru dibuat");

        // Buat tabel events jika belum ada
        db.run(`
                        CREATE TABLE IF NOT EXISTS events (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            title TEXT NOT NULL,
                            description TEXT,
                            date_time TEXT NOT NULL,
                            location TEXT NOT NULL,
                            capacity INTEGER,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `);

        // Buat tabel registrations jika belum ada
        db.run(`
                        CREATE TABLE IF NOT EXISTS registrations (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            event_id INTEGER NOT NULL,
                            full_name TEXT NOT NULL,
                            email TEXT NOT NULL,
                            phone TEXT,
                            registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (event_id) REFERENCES events (id)
                        )
                    `);

        // Simpan database ke localStorage
        saveDatabase();

        // Tambahkan data contoh jika database kosong
        addSampleData();
      }

      // Render data setelah database siap
      renderEvents();
      renderStats();
      renderRegistrations();
      renderDashboard();
    })
    .catch(function (error) {
      console.error("Error initializing database:", error);
      eventsContainer.innerHTML = `
                    <div class="message message-error">
                        <p>Error memuat database: ${error.message}</p>
                        <p>Pastikan Anda terhubung ke internet untuk memuat SQLite.</p>
                    </div>
                `;
    });
}

// Toggle sidebar
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;

  if (sidebarCollapsed) {
    sidebar.classList.add("collapsed");
    mainContent.classList.add("sidebar-collapsed");
    sidebarIcon.classList.remove("fa-chevron-left");
    sidebarIcon.classList.add("fa-chevron-right");
  } else {
    sidebar.classList.remove("collapsed");
    mainContent.classList.remove("sidebar-collapsed");
    sidebarIcon.classList.remove("fa-chevron-right");
    sidebarIcon.classList.add("fa-chevron-left");
  }
}

// Toggle mobile sidebar
function toggleMobileSidebar() {
  sidebar.classList.toggle("active");
}

// Render dashboard
function renderDashboard() {
  try {
    // Hitung acara berdasarkan status
    const now = new Date().toISOString();

    // Acara mendatang
    const upcomingStmt = db.prepare(
      "SELECT COUNT(*) as count FROM events WHERE date_time > :now"
    );
    upcomingStmt.bind({ ":now": now });
    upcomingStmt.step();
    const upcoming = upcomingStmt.getAsObject().count;
    upcomingStmt.free();

    // Acara sedang berlangsung (dalam 3 jam terakhir hingga sekarang)
    const threeHoursAgo = new Date(
      Date.now() - 3 * 60 * 60 * 1000
    ).toISOString();
    const ongoingStmt = db.prepare(
      "SELECT COUNT(*) as count FROM events WHERE date_time BETWEEN :threeHoursAgo AND :now"
    );
    ongoingStmt.bind({
      ":threeHoursAgo": threeHoursAgo,
      ":now": now,
    });
    ongoingStmt.step();
    const ongoing = ongoingStmt.getAsObject().count;
    ongoingStmt.free();

    // Acara selesai
    const completedStmt = db.prepare(
      "SELECT COUNT(*) as count FROM events WHERE date_time < :now"
    );
    completedStmt.bind({ ":now": now });
    completedStmt.step();
    const completed = completedStmt.getAsObject().count;
    completedStmt.free();

    // Update count
    upcomingCount.textContent = upcoming;
    ongoingCount.textContent = ongoing;
    completedCount.textContent = completed;

    // Render acara mendatang
    const upcomingEventsStmt = db.prepare(
      "SELECT * FROM events WHERE date_time > :now ORDER BY date_time ASC LIMIT 3"
    );
    upcomingEventsStmt.bind({ ":now": now });

    let upcomingEventsHTML = "";
    let upcomingEventsData = [];

    while (upcomingEventsStmt.step()) {
      upcomingEventsData.push(upcomingEventsStmt.getAsObject());
    }
    upcomingEventsStmt.free();

    if (upcomingEventsData.length === 0) {
      upcomingEventsHTML = `
              <div class="empty-state">
                <i class="fas fa-calendar-plus"></i>
                <h3>Tidak ada acara mendatang</h3>
                <p>Buat acara baru untuk melihatnya di sini</p>
              </div>
            `;
    } else {
      upcomingEventsData.forEach((event) => {
        const daysLeft = calculateDaysLeft(event.date_time);

        upcomingEventsHTML += `
                <div class="event-card">
                  <div class="event-header">
                    <h3>${escapeHtml(event.title)}</h3>
                    <span class="event-status status-upcoming">Mendatang</span>
                  </div>
                  <div class="event-body">
                    <p>${
                      escapeHtml(event.description) || "Tidak ada deskripsi"
                    }</p>
                    <p><strong><i class="fas fa-calendar"></i> :</strong> ${formatDateTime(
                      event.date_time
                    )}</p>
                    <p><strong><i class="fas fa-map-marker-alt"></i> :</strong> ${escapeHtml(
                      event.location
                    )}</p>
                    <span class="countdown upcoming">${daysLeft} hari lagi</span>
                  </div>
                  <div class="event-footer">
                    <button onclick="viewEventDetails(${
                      event.id
                    })" style="background: var(--info)">Detail</button>
                    <button onclick="openRegistration(${
                      event.id
                    }, '${escapeHtml(event.title).replace(
          /'/g,
          "\\'"
        )}')">Daftar</button>
                  </div>
                </div>
              `;
      });
    }

    upcomingEvents.innerHTML = upcomingEventsHTML;

    // Render acara terbaru
    const recentEventsStmt = db.prepare(
      "SELECT * FROM events ORDER BY created_at DESC LIMIT 3"
    );

    let recentEventsHTML = "";
    let recentEventsData = [];

    while (recentEventsStmt.step()) {
      recentEventsData.push(recentEventsStmt.getAsObject());
    }
    recentEventsStmt.free();

    if (recentEventsData.length === 0) {
      recentEventsHTML = `
              <div class="empty-state">
                <i class="fas fa-calendar-plus"></i>
                <h3>Belum ada acara</h3>
                <p>Buat acara pertama Anda</p>
              </div>
            `;
    } else {
      recentEventsData.forEach((event) => {
        const eventStatus = getEventStatus(event.date_time);
        const statusClass =
          eventStatus === "upcoming"
            ? "status-upcoming"
            : eventStatus === "ongoing"
            ? "status-ongoing"
            : "status-completed";
        const statusText =
          eventStatus === "upcoming"
            ? "Mendatang"
            : eventStatus === "ongoing"
            ? "Berlangsung"
            : "Selesai";

        recentEventsHTML += `
                <div class="event-card">
                  <div class="event-header">
                    <h3>${escapeHtml(event.title)}</h3>
                    <span class="event-status ${statusClass}">${statusText}</span>
                  </div>
                  <div class="event-body">
                    <p>${
                      escapeHtml(event.description) || "Tidak ada deskripsi"
                    }</p>
                    <p><strong><i class="fas fa-calendar"></i> :</strong> ${formatDateTime(
                      event.date_time
                    )}</p>
                    <p><strong><i class="fas fa-map-marker-alt"></i> :</strong> ${escapeHtml(
                      event.location
                    )}</p>
                  </div>
                  <div class="event-footer">
                    <button onclick="viewEventDetails(${
                      event.id
                    })" style="background: var(--gray)">Detail</button>
                    <button onclick="openRegistration(${
                      event.id
                    }, '${escapeHtml(event.title).replace(
          /'/g,
          "\\'"
        )}')">Daftar</button>
                  </div>
                </div>
              `;
      });
    }

    recentEvents.innerHTML = recentEventsHTML;
  } catch (error) {
    console.error("Error rendering dashboard:", error);
  }
}

function calculateDaysLeft(dateTime) {
  const eventDate = new Date(dateTime);
  const now = new Date();
  const diffTime = eventDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getEventStatus(dateTime) {
  const eventDate = new Date(dateTime);
  const now = new Date();
  const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000);

  if (eventDate > now) {
    return "upcoming";
  } else if (eventDate >= threeHoursAgo && eventDate <= now) {
    return "ongoing";
  } else {
    return "completed";
  }
}

// Simpan database ke localStorage
function saveDatabase() {
  if (!db) return;

  try {
    // Ekspor database ke Uint8Array
    const data = db.export();

    // Konversi ke base64 untuk penyimpanan di localStorage
    const base64 = btoa(String.fromCharCode(...data));

    // Simpan ke localStorage
    localStorage.setItem("event_management_db", base64);

    console.log("Database disimpan ke localStorage");
  } catch (error) {
    console.error("Error saving database:", error);
  }
}

// Render events to the page
function renderEvents() {
  try {
    // Query untuk mendapatkan semua event
    const stmt = db.prepare(`
                    SELECT * FROM events ORDER BY date_time ASC
                `);

    const events = [];
    while (stmt.step()) {
      events.push(stmt.getAsObject());
    }
    stmt.free();

    if (events.length === 0) {
      eventsContainer.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-calendar-plus"></i>
                            <h3>Belum ada acara</h3>
                            <p>Buat acara pertama Anda dengan menekan tab "Buat Acara"</p>
                        </div>
                    `;
      return;
    }

    let eventsHTML = "";

    events.forEach((event) => {
      // Query untuk mendapatkan jumlah pendaftar per event
      const countStmt = db.prepare(`
                        SELECT COUNT(*) as count FROM registrations WHERE event_id = :event_id
                    `);
      countStmt.bind({ ":event_id": event.id });
      countStmt.step();
      const registrationCount = countStmt.getAsObject().count;
      countStmt.free();

      let badgeClass = "badge-success";
      let badgeText = "Tersedia";

      if (event.capacity) {
        if (registrationCount >= event.capacity) {
          badgeClass = "badge-danger";
          badgeText = "Penuh";
        } else if (registrationCount >= event.capacity * 0.8) {
          badgeClass = "badge-warning";
          badgeText = "Hampir Penuh";
        }
      }

      // Determine event status
      const eventStatus = getEventStatus(event.date_time);
      const statusClass =
        eventStatus === "upcoming"
          ? "status-upcoming"
          : eventStatus === "ongoing"
          ? "status-ongoing"
          : "status-completed";
      const statusText =
        eventStatus === "upcoming"
          ? "Mendatang"
          : eventStatus === "ongoing"
          ? "Berlangsung"
          : "Selesai";

      eventsHTML += `
                        <div class="event-card">
                            <div class="event-header">
                                <h3>${escapeHtml(event.title)}</h3>
                                <span class="event-status ${statusClass}">${statusText}</span>
                            </div>
                            <div class="event-body">
                                <p>${
                                  escapeHtml(event.description) ||
                                  "Tidak ada deskripsi"
                                }</p>
                                <p><strong><i class="fas fa-calendar"></i> :</strong> ${formatDateTime(
                                  event.date_time
                                )}</p>
                                <p><strong><i class="fas fa-map-marker-alt"></i> :</strong> ${escapeHtml(
                                  event.location
                                )}</p>
                                <p><strong><i class="fas fa-users"></i> :</strong> ${
                                  event.capacity
                                    ? `${registrationCount} / ${event.capacity} peserta`
                                    : `${registrationCount} peserta`
                                }</p>
                            </div>
                            <div class="event-footer">
                                <span class="badge ${badgeClass}">${badgeText}</span>
                                <div>
                                    <button onclick="openRegistration(${
                                      event.id
                                    }, '${escapeHtml(event.title).replace(
        /'/g,
        "\\'"
      )}')">Daftar</button>
                                    <button onclick="viewEventDetails(${
                                      event.id
                                    })" style="background: var(--gray)">Detail</button>
                                </div>
                            </div>
                        </div>
                    `;
    });

    eventsContainer.innerHTML = `<div class="events-grid">${eventsHTML}</div>`;
  } catch (error) {
    console.error("Error rendering events:", error);
    eventsContainer.innerHTML = `
                    <div class="message message-error">
                        <p>Error memuat acara: ${error.message}</p>
                    </div>
                `;
  }
}

// Render statistics
function renderStats() {
  try {
    // Total events
    const totalEventsStmt = db.prepare("SELECT COUNT(*) as count FROM events");
    totalEventsStmt.step();
    const totalEvents = totalEventsStmt.getAsObject().count;
    totalEventsStmt.free();

    // Total registrations
    const totalRegistrationsStmt = db.prepare(
      "SELECT COUNT(*) as count FROM registrations"
    );
    totalRegistrationsStmt.step();
    const totalRegistrations = totalRegistrationsStmt.getAsObject().count;
    totalRegistrationsStmt.free();

    const now = new Date().toISOString();
    const upcomingEventsStmt = db.prepare(
      "SELECT COUNT(*) as count FROM events WHERE date_time > :now"
    );
    upcomingEventsStmt.bind({ ":now": now });
    upcomingEventsStmt.step();
    const upcomingEventsCount = upcomingEventsStmt.getAsObject().count;
    upcomingEventsStmt.free();

    statsContainer.innerHTML = `
                    <div class="stat-card">
                        <h3>${totalEvents}</h3>
                        <p>Total Acara</p>
                    </div>
                    <div class="stat-card">
                        <h3>${totalRegistrations}</h3>
                        <p>Total Pendaftar</p>
                    </div>
                    <div class="stat-card">
                        <h3>${upcomingEventsCount}</h3>
                        <p>Acara Mendatang</p>
                    </div>
                `;
  } catch (error) {
    console.error("Error rendering stats:", error);
    statsContainer.innerHTML = `
                    <div class="message message-error">
                        <p>Error memuat statistik: ${error.message}</p>
                    </div>
                `;
  }
}

// Render registrations table
function renderRegistrations() {
  try {
    // Query untuk mendapatkan semua pendaftaran dengan nama event
    const stmt = db.prepare(`
                    SELECT r.*, e.title as event_title 
                    FROM registrations r 
                    LEFT JOIN events e ON r.event_id = e.id 
                    ORDER BY r.registration_date DESC
                `);

    const registrations = [];
    while (stmt.step()) {
      registrations.push(stmt.getAsObject());
    }
    stmt.free();

    if (registrations.length === 0) {
      registrationsBody.innerHTML = `
                        <tr>
                            <td colspan="6" style="text-align: center;">Belum ada pendaftar.</td>
                        </tr>
                    `;
      return;
    }

    let registrationsHTML = "";

    registrations.forEach((registration) => {
      registrationsHTML += `
                        <tr>
                            <td>${escapeHtml(registration.full_name)}</td>
                            <td>${escapeHtml(
                              registration.event_title ||
                                "Acara tidak ditemukan"
                            )}</td>
                            <td>${escapeHtml(registration.email)}</td>
                            <td>${
                              registration.phone
                                ? escapeHtml(registration.phone)
                                : "-"
                            }</td>
                            <td>${formatDateTime(
                              registration.registration_date
                            )}</td>
                            <td>
                                <button class="btn-danger btn-sm" onclick="deleteRegistration(${
                                  registration.id
                                })">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `;
    });

    registrationsBody.innerHTML = registrationsHTML;
  } catch (error) {
    console.error("Error rendering registrations:", error);
    registrationsBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center;">
                            <div class="message message-error">
                                <p>Error memuat pendaftaran: ${error.message}</p>
                            </div>
                        </td>
                    </tr>
                `;
  }
}

function handleCreateEvent(e) {
  e.preventDefault();

  const formData = new FormData(createEventForm);
  const title = formData.get("title");
  const description = formData.get("description");
  const date_time = formData.get("date_time");
  const location = formData.get("location");
  const capacity = formData.get("capacity");

  try {
    // Insert event ke database
    const stmt = db.prepare(`
                    INSERT INTO events (title, description, date_time, location, capacity) 
                    VALUES (:title, :description, :date_time, :location, :capacity)
                `);

    stmt.bind({
      ":title": title,
      ":description": description,
      ":date_time": date_time,
      ":location": location,
      ":capacity": capacity ? parseInt(capacity) : null,
    });

    stmt.step();
    stmt.free();

    // Simpan perubahan ke localStorage
    saveDatabase();

    showToast("Acara berhasil dibuat!", "success");
    createEventForm.reset();

    renderEvents();
    renderStats();
    renderDashboard();
  } catch (error) {
    console.error("Error creating event:", error);
    showToast("Error membuat acara: " + error.message, "error");
  }
}

function handleRegistration(e) {
  e.preventDefault();

  const formData = new FormData(registrationForm);
  const event_id = parseInt(formData.get("event_id"));
  const full_name = formData.get("full_name");
  const email = formData.get("email");
  const phone = formData.get("phone");

  try {
    // Cek kapasitas acara
    const eventStmt = db.prepare(
      "SELECT capacity FROM events WHERE id = :event_id"
    );
    eventStmt.bind({ ":event_id": event_id });

    if (!eventStmt.step()) {
      showToast("Acara tidak ditemukan!", "error");
      eventStmt.free();
      return;
    }

    const event = eventStmt.getAsObject();
    eventStmt.free();

    // Cek jumlah pendaftar
    const countStmt = db.prepare(
      "SELECT COUNT(*) as count FROM registrations WHERE event_id = :event_id"
    );
    countStmt.bind({ ":event_id": event_id });
    countStmt.step();
    const registrationCount = countStmt.getAsObject().count;
    countStmt.free();

    if (event.capacity && registrationCount >= event.capacity) {
      showToast("Maaf, acara ini sudah penuh!", "error");
      closeModal();
      return;
    }

    // Insert registration ke database
    const stmt = db.prepare(`
                    INSERT INTO registrations (event_id, full_name, email, phone) 
                    VALUES (:event_id, :full_name, :email, :phone)
                `);

    stmt.bind({
      ":event_id": event_id,
      ":full_name": full_name,
      ":email": email,
      ":phone": phone,
    });

    stmt.step();
    stmt.free();

    // Simpan perubahan ke localStorage
    saveDatabase();

    showToast("Pendaftaran berhasil!", "success");
    registrationForm.reset();
    closeModal();

    renderEvents();
    renderStats();
    renderRegistrations();
    renderDashboard();
  } catch (error) {
    console.error("Error creating registration:", error);
    showToast("Error membuat pendaftaran: " + error.message, "error");
  }
}

function openRegistration(eventId, eventTitle) {
  document.getElementById("eventId").value = eventId;
  document.getElementById("eventTitle").textContent = eventTitle;
  document.getElementById("registrationModal").style.display = "flex";
}

function viewEventDetails(eventId) {
  try {
    const eventStmt = db.prepare("SELECT * FROM events WHERE id = :event_id");
    eventStmt.bind({ ":event_id": eventId });

    if (!eventStmt.step()) {
      showToast("Acara tidak ditemukan!", "error");
      eventStmt.free();
      return;
    }

    const event = eventStmt.getAsObject();
    eventStmt.free();

    const regStmt = db.prepare(
      "SELECT * FROM registrations WHERE event_id = :event_id ORDER BY registration_date DESC"
    );
    regStmt.bind({ ":event_id": eventId });

    const eventRegistrations = [];
    while (regStmt.step()) {
      eventRegistrations.push(regStmt.getAsObject());
    }
    regStmt.free();

    const registrationCount = eventRegistrations.length;

    let capacityInfo = event.capacity
      ? `${registrationCount} dari ${event.capacity} peserta`
      : `${registrationCount} peserta (tanpa batas)`;

    let capacityStatus = "";
    if (event.capacity) {
      if (registrationCount >= event.capacity) {
        capacityStatus = '<span class="badge badge-danger">Penuh</span>';
      } else if (registrationCount >= event.capacity * 0.8) {
        capacityStatus =
          '<span class="badge badge-warning">Hampir Penuh</span>';
      } else {
        capacityStatus = '<span class="badge badge-success">Tersedia</span>';
      }
    }

    document.getElementById("eventDetailContent").innerHTML = `
                    <h3>${escapeHtml(event.title)}</h3>
                    <p>${
                      escapeHtml(event.description) || "Tidak ada deskripsi"
                    }</p>
                    <p><strong><i class="fas fa-calendar"></i> Waktu:</strong> ${formatDateTime(
                      event.date_time
                    )}</p>
                    <p><strong><i class="fas fa-map-marker-alt"></i> Lokasi:</strong> ${escapeHtml(
                      event.location
                    )}</p>
                    <p><strong><i class="fas fa-users"></i> Kapasitas:</strong> ${capacityInfo} ${capacityStatus}</p>
                    
                    <h4 style="margin-top: 20px;">Daftar Peserta</h4>
                    ${
                      eventRegistrations.length > 0
                        ? `<ul style="list-style: none; margin-top: 10px;">
                          ${eventRegistrations
                            .map(
                              (r) => `
                              <li style="padding: 8px; border-bottom: 1px solid #eee;">
                                  <strong>${escapeHtml(
                                    r.full_name
                                  )}</strong> (${escapeHtml(r.email)}) ${
                                r.phone ? `- ${escapeHtml(r.phone)}` : ""
                              }
                              </li>
                          `
                            )
                            .join("")}
                      </ul>`
                        : "<p>Belum ada peserta yang terdaftar.</p>"
                    }
                `;

    document.getElementById("eventDetailModal").style.display = "flex";
  } catch (error) {
    console.error("Error viewing event details:", error);
    showToast("Error melihat detail acara: " + error.message, "error");
  }
}

// Delete event
function deleteEvent(eventId) {
  eventToDelete = eventId;
  document.getElementById("confirmDeleteModal").style.display = "flex";
}

// Konfirmasi delete
function confirmDelete() {
  if (eventToDelete) {
    try {
      // Hapus event dan registrasinya (dengan transaction)
      db.exec("BEGIN TRANSACTION");

      // Hapus registrations terkait
      const delRegStmt = db.prepare(
        "DELETE FROM registrations WHERE event_id = :event_id"
      );
      delRegStmt.bind({ ":event_id": eventToDelete });
      delRegStmt.step();
      delRegStmt.free();

      // Hapus event
      const delEventStmt = db.prepare(
        "DELETE FROM events WHERE id = :event_id"
      );
      delEventStmt.bind({ ":event_id": eventToDelete });
      delEventStmt.step();
      delEventStmt.free();

      db.exec("COMMIT");

      // Simpan perubahan ke localStorage
      saveDatabase();

      showToast("Acara berhasil dihapus!", "success");

      renderEvents();
      renderStats();
      renderRegistrations();
      renderDashboard();

      eventToDelete = null;
    } catch (error) {
      db.exec("ROLLBACK");
      console.error("Error deleting event:", error);
      showToast("Error menghapus acara: " + error.message, "error");
    }
  }

  closeModal();
}

// Delete registration
function deleteRegistration(registrationId) {
  if (confirm("Anda yakin ingin menghapus pendaftaran ini?")) {
    try {
      const stmt = db.prepare("DELETE FROM registrations WHERE id = :id");
      stmt.bind({ ":id": registrationId });
      stmt.step();
      stmt.free();

      // Simpan perubahan ke localStorage
      saveDatabase();

      showToast("Pendaftaran berhasil dihapus!", "success");

      renderEvents();
      renderStats();
      renderRegistrations();
      renderDashboard();
    } catch (error) {
      console.error("Error deleting registration:", error);
      showToast("Error menghapus pendaftaran: " + error.message, "error");
    }
  }
}

// Backup database to file
function backupDatabase() {
  if (!db) {
    showToast("Database belum siap!", "error");
    return;
  }

  try {
    // Ekspor database ke Uint8Array
    const data = db.export();

    // Buat blob dari data
    const blob = new Blob([data], { type: "application/x-sqlite3" });

    // Buat URL untuk blob
    const url = URL.createObjectURL(blob);

    // Buat elemen a untuk download
    const a = document.createElement("a");
    a.href = url;
    a.download = "event_management_backup.sqlite";
    a.click();

    // Bersihkan URL
    URL.revokeObjectURL(url);

    showToast("Backup database berhasil!", "success");
  } catch (error) {
    console.error("Error backing up database:", error);
    showToast("Error backup database: " + error.message, "error");
  }
}

// Restore database dari file
function restoreDatabase() {
  const fileInput = document.getElementById("databaseFile");
  const file = fileInput.files[0];

  if (!file) {
    showToast("Pilih file database terlebih dahulu!", "error");
    return;
  }

  if (
    !confirm("Restore database akan mengganti semua data yang ada. Lanjutkan?")
  ) {
    return;
  }

  const reader = new FileReader();
  reader.onload = function () {
    try {
      // Baca file sebagai array buffer
      const arrayBuffer = this.result;
      const uint8Array = new Uint8Array(arrayBuffer);

      // Tutup database lama jika ada
      if (db) {
        db.close();
      }

      // Buat database baru dari file
      db = new SQL.Database(uint8Array);

      // Simpan ke localStorage
      saveDatabase();

      // Render ulang data
      renderEvents();
      renderStats();
      renderRegistrations();
      renderDashboard();

      showToast("Database berhasil di-restore!", "success");
      fileInput.value = "";
    } catch (error) {
      console.error("Error restoring database:", error);
      showToast("Error restore database: " + error.message, "error");
    }
  };
  reader.readAsArrayBuffer(file);
}

// Reset database
function resetDatabase() {
  if (!confirm("Hapus semua data? Tindakan ini tidak dapat dibatalkan!")) {
    return;
  }

  try {
    // Hapus database dari localStorage
    localStorage.removeItem("event_management_db");

    // Tutup database lama
    if (db) {
      db.close();
    }

    // Buat database baru
    db = new SQL.Database();

    // Buat tabel
    db.run(`
                    CREATE TABLE IF NOT EXISTS events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        description TEXT,
                        date_time TEXT NOT NULL,
                        location TEXT NOT NULL,
                        capacity INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

    db.run(`
                    CREATE TABLE IF NOT EXISTS registrations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        event_id INTEGER NOT NULL,
                        full_name TEXT NOT NULL,
                        email TEXT NOT NULL,
                        phone TEXT,
                        registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (event_id) REFERENCES events (id)
                    )
                `);

    // Simpan database baru
    saveDatabase();

    // Render ulang data
    renderEvents();
    renderStats();
    renderRegistrations();
    renderDashboard();

    showToast("Semua data berhasil dihapus!", "success");
  } catch (error) {
    console.error("Error resetting database:", error);
    showToast("Error menghapus data: " + error.message, "error");
  }
}

function closeModal() {
  document.getElementById("registrationModal").style.display = "none";
  document.getElementById("eventDetailModal").style.display = "none";
  document.getElementById("confirmDeleteModal").style.display = "none";
}

function showTab(tabName) {
  document.querySelectorAll(".tab-content").forEach((tab) => {
    tab.classList.remove("active");
  });

  document.querySelectorAll(".menu-item").forEach((item) => {
    item.classList.remove("active");
  });

  document.getElementById(tabName + "Tab").classList.add("active");

  const menuIndex = {
    dashboard: 1,
    create: 2,
    events: 3,
    manage: 4,
    backup: 5,
    about: 6,
  }[tabName];

  document
    .querySelector(`.menu-item:nth-child(${menuIndex})`)
    .classList.add("active");

  if (tabName === "events") renderEvents();
  if (tabName === "manage") {
    renderStats();
    renderRegistrations();
  }
  if (tabName === "dashboard") {
    renderDashboard();
  }

  if (window.innerWidth <= 992) {
    sidebar.classList.remove("active");
  }
}

function formatDateTime(dateTimeString) {
  const date = new Date(dateTimeString);
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, type = "success") {
  const existingToasts = document.querySelectorAll(".toast");
  existingToasts.forEach((toast) => toast.remove());

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
          <i class="fas ${
            type === "success" ? "fa-check-circle" : "fa-exclamation-circle"
          }"></i>
          <span>${message}</span>
        `;

  // Add ke document
  document.body.appendChild(toast);

  // Hapus setelah 3 detik
  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s ease forwards";
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

function addSampleData() {
  try {
    // Cek jika sudah ada data
    const checkStmt = db.prepare("SELECT COUNT(*) as count FROM events");
    checkStmt.step();
    const eventCount = checkStmt.getAsObject().count;
    checkStmt.free();

    if (eventCount > 0) return; // Jangan tambahkan data contoh jika sudah ada data

    // Tambahkan data contoh
    const sampleEvents = [
      {
        title: "Seminar Kewirausahaan",
        description:
          "Seminar tentang bagaimana memulai bisnis dari nol hingga sukses",
        date_time: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 16),
        location: "Aula Universitas",
        capacity: 100,
      },
      {
        title: "Workshop Pemrograman Web",
        description:
          "Pelatihan pembuatan website modern dengan HTML, CSS, dan JavaScript",
        date_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 16),
        location: "Lab Komputer",
        capacity: 30,
      },
      {
        title: "Festival Musik",
        description: "Festival musik dengan berbagai band lokal dan nasional",
        date_time: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 16),
        location: "Lapangan Kota",
        capacity: 500,
      },
      {
        title: "Webinar Teknologi Terkini",
        description: "Diskusi tentang perkembangan teknologi terbaru",
        date_time: new Date(Date.now() - 2 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 16),
        location: "Online Zoom Meeting",
        capacity: 200,
      },
      {
        title: "Pelatihan Public Speaking",
        description: "Meningkatkan kemampuan berbicara di depan umum",
        date_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 16),
        location: "Ruang Serbaguna",
        capacity: 50,
      },
    ];

    sampleEvents.forEach((event) => {
      const stmt = db.prepare(`
                        INSERT INTO events (title, description, date_time, location, capacity) 
                        VALUES (:title, :description, :date_time, :location, :capacity)
                    `);

      stmt.bind({
        ":title": event.title,
        ":description": event.description,
        ":date_time": event.date_time,
        ":location": event.location,
        ":capacity": event.capacity,
      });

      stmt.step();
      stmt.free();
    });

    // Simpan perubahan ke localStorage
    saveDatabase();

    // Render ulang data
    renderEvents();
    renderStats();
    renderDashboard();
  } catch (error) {
    console.error("Error adding sample data:", error);
  }
}

window.onload = function () {
  initApp();
};

window.onclick = function (event) {
  if (event.target == document.getElementById("registrationModal")) {
    closeModal();
  }
  if (event.target == document.getElementById("eventDetailModal")) {
    closeModal();
  }
  if (event.target == document.getElementById("confirmDeleteModal")) {
    closeModal();
  }
};
