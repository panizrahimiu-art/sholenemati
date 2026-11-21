import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const SITE = window.SITE_CONFIG || {};
const app = initializeApp(SITE.firebase);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (s) => document.querySelector(s);
const loginView = $("#loginView");
const appView = $("#appView");
const loginError = $("#loginError");
const loginForm = $("#loginForm");
const selectedDate = $("#selectedDate");
const slotTime = $("#slotTime");
const slotLabel = $("#slotLabel");
const slotsEl = $("#slots");
const dateLabel = $("#dateLabel");
const availableCount = $("#availableCount");
const bookedCount = $("#bookedCount");
const totalCount = $("#totalCount");

const todayISO = () => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

selectedDate.value = todayISO();

function isAdmin(user) {
  const allowed = String(SITE.adminEmail || "").trim().toLowerCase();
  if (!allowed) return true;
  return user?.email?.toLowerCase() === allowed;
}

function showApp(user) {
  if (!isAdmin(user)) {
    loginError.textContent = "این حساب اجازه ورود به پنل مدیریت را ندارد.";
    signOut(auth);
    return;
  }

  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  loadSlots();
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    showApp(user);
  } else {
    loginView.classList.remove("hidden");
    appView.classList.add("hidden");
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";

  try {
    await signInWithEmailAndPassword(
      auth,
      $("#email").value.trim(),
      $("#password").value
    );
  } catch (error) {
    loginError.textContent =
      "ورود انجام نشد. ایمیل یا رمز عبور را بررسی کنید.";
  }
});

$("#logoutBtn").addEventListener("click", () => signOut(auth));

$("#todayBtn").addEventListener("click", () => {
  selectedDate.value = todayISO();
  loadSlots();
});

$("#refreshBtn").addEventListener("click", loadSlots);

selectedDate.addEventListener("change", loadSlots);

$("#addSlotBtn").addEventListener("click", async () => {
  const date = selectedDate.value;
  const time = slotTime.value;
  const label = slotLabel.value.trim();

  if (!date || !time) {
    return alert("تاریخ و ساعت را وارد کن.");
  }

  const id = `${date}_${time.replace(/:/g, "-")}`;

  const ref = doc(db, "appointmentSlots", id);

  await setDoc(
    ref,
    {
      date,
      time,
      label,
      status: "available",
      patientName: "",
      patientPhone: "",
      service: "",
      createdAt: Date.now()
    },
    { merge: true }
  );

  slotTime.value = "";
  slotLabel.value = "";

  await loadSlots();
});

async function loadSlots() {
  if (!selectedDate.value) return;

  dateLabel.textContent = selectedDate.value;

  slotsEl.innerHTML =
    "<div class='empty'>در حال دریافت زمان‌ها...</div>";

  const q = query(
    collection(db, "appointmentSlots"),
    where("date", "==", selectedDate.value),
    orderBy("time", "asc")
  );

  const snap = await getDocs(q);

  const docs = snap.docs.map((d) => ({
    id: d.id,
    ...d.data()
  }));

  availableCount.textContent =
    docs.filter((x) => x.status === "available").length;

  bookedCount.textContent =
    docs.filter((x) => x.status === "booked").length;

  totalCount.textContent = docs.length;

  if (!docs.length) {
    slotsEl.innerHTML =
      "<div class='empty'>برای این روز هنوز ساعتی تعریف نشده است.</div>";
    return;
  }

  slotsEl.innerHTML = docs
    .map((slot) => {
      const booked = slot.status === "booked";

      return `
        <div class="slot ${booked ? "booked" : "available"}">
          <strong>${escapeHtml(slot.time)}</strong>

          <small>
            ${
              booked
                ? `رزرو: ${escapeHtml(slot.patientName || "بیمار")}`
                : escapeHtml(slot.label || "آزاد")
            }
          </small>

          <div class="slot-actions">

            <button
              class="${booked ? "free" : "reserve"}"
              data-toggle="${slot.id}"
              data-status="${booked ? "available" : "booked"}"
            >
              ${booked ? "آزاد کردن" : "پر کردن"}
            </button>

            <button
              class="delete"
              data-delete="${slot.id}"
            >
              حذف
            </button>

          </div>
        </div>
      `;
    })
    .join("");

  slotsEl.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () =>
      toggleSlot(
        btn.dataset.toggle,
        btn.dataset.status
      )
    );
  });

  slotsEl.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () =>
      deleteSlot(btn.dataset.delete)
    );
  });
}

async function toggleSlot(id, status) {
  await updateDoc(
    doc(db, "appointmentSlots", id),
    {
      status,

      ...(status === "available"
        ? {
            patientName: "",
            patientPhone: "",
            service: ""
          }
        : {})
    }
  );

  await loadSlots();
}

async function deleteSlot(id) {
  if (!confirm("این زمان حذف شود؟")) return;

  await deleteDoc(
    doc(db, "appointmentSlots", id)
  );

  await loadSlots();
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
      }[c])
  );
}
