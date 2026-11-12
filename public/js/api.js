/* ================================================================
   ATLAS COMMONS — shared client helpers (100% Vanilla JS)
   ================================================================ */
"use strict";

/* ---------------------------- Auth store ---------------------------- */
const Auth = {
  KEY: "atlas_auth",

  save(auth) {
    localStorage.setItem(Auth.KEY, JSON.stringify(auth));
  },

  get() {
    try {
      return JSON.parse(localStorage.getItem(Auth.KEY));
    } catch (_) {
      return null;
    }
  },

  clear() {
    localStorage.removeItem(Auth.KEY);
  },

  logout() {
    Auth.clear();
    window.location.href = "login.html";
  },

  home(role) {
    return role === "PROFESSOR" ? "professor-dashboard.html" : "student-dashboard.html";
  },
};

/* ------------------------- Fetch API client -------------------------- */
async function apiFetch(path, options) {
  const opts = options || {};
  const auth = Auth.get();

  const headers = { "Content-Type": "application/json" };
  if (auth && auth.token) headers["Authorization"] = "Bearer " + auth.token;

  const response = await fetch(path, {
    method: opts.method || "GET",
    headers: headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (response.status === 401) {
    Auth.clear();
    window.location.href = "login.html";
    throw new Error((data && data.error) || "Your session has expired.");
  }

  if (!response.ok) {
    const err = new Error((data && data.error) || "Request failed (" + response.status + ")");
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

/* --------------------------- Route guards ---------------------------- */
function requireAuth(expectedRole) {
  const auth = Auth.get();
  if (!auth || !auth.token) {
    window.location.href = "login.html";
    return null;
  }
  if (expectedRole && auth.role !== expectedRole) {
    window.location.href = Auth.home(auth.role);
    return null;
  }
  return auth;
}

function redirectIfAuthed() {
  const auth = Auth.get();
  if (auth && auth.token) {
    window.location.href = Auth.home(auth.role);
  }
}

/* ------------------------------ Toasts ------------------------------- */
function toast(message, type) {
  type = type || "success";
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.innerHTML =
    '<i data-lucide="' + (type === "error" ? "alert-circle" : "check-circle-2") + '"></i>' +
    "<span>" + escapeHtml(message) + "</span>";
  wrap.appendChild(el);
  icons();
  window.setTimeout(function () {
    el.classList.add("out");
    window.setTimeout(function () { el.remove(); }, 380);
  }, 3600);
}

/* ------------------------------ Helpers ------------------------------ */
function icons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(value) {
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch (_) {
    return "";
  }
}

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(function (p) { return p.charAt(0).toUpperCase(); })
    .join("");
}

function setButtonLoading(btn, loading, idleHtml) {
  if (!btn) return;
  if (loading) {
    btn.dataset.idleHtml = btn.innerHTML;
    btn.classList.add("spinning");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span class="btn-label">Working…</span>';
  } else {
    btn.classList.remove("spinning");
    btn.disabled = false;
    btn.innerHTML = idleHtml || btn.dataset.idleHtml || btn.innerHTML;
    icons();
  }
}

const STATUS_LABELS = {
  TO_DO: "To Do",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};

const STATUS_ORDER = ["TO_DO", "IN_PROGRESS", "COMPLETED"];
