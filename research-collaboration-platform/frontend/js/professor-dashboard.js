(async function () {
  "use strict";

  var auth = requireAuth("PROFESSOR");
  if (!auth) return;

  /* --------------------- Elements --------------------- */
  var els = {
    list: document.getElementById("projectList"),
    countNote: document.getElementById("countNote"),
    statProjects: document.getElementById("statProjects"),
    statPending: document.getElementById("statPending"),
    statJoined: document.getElementById("statJoined"),
    statTasks: document.getElementById("statTasks"),
    backdrop: document.getElementById("modalBackdrop"),
    openPublish: document.getElementById("openPublishBtn"),
    closeModal: document.getElementById("closeModalBtn"),
    publishForm: document.getElementById("publishForm"),
    publishBtn: document.getElementById("publishBtn"),
    modalError: document.getElementById("modalError"),
    greeting: document.getElementById("greeting"),
    logout: document.getElementById("logoutBtn"),
  };

  /* ------------------- Identity ----------------------- */
  document.getElementById("userName").textContent = auth.name;
  document.getElementById("userAvatar").textContent = initials(auth.name);
  var first = auth.name.trim().split(" ")[0];
  var hour = new Date().getHours();
  var day = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  els.greeting.innerHTML = "Good " + day + ", <em>" + escapeHtml(first) + "</em>.";

  els.logout.addEventListener("click", Auth.logout);

  /* --------------------- State ------------------------ */
  var state = { projects: [], open: new Set() };

  /* --------------------- Rendering -------------------- */
  function statusLabel(s) { return STATUS_LABELS[s] || s; }

  function renderStats() {
    var pending = 0, joined = 0, tasks = 0;
    state.projects.forEach(function (p) {
      p.applications.forEach(function (a) {
        if (a.status === "PENDING") pending++;
        if (a.status === "JOINED") joined++;
      });
      tasks += p.tasks.length;
    });
    els.statProjects.textContent = state.projects.length;
    els.statPending.textContent = pending;
    els.statJoined.textContent = joined;
    els.statTasks.textContent = tasks;
    els.countNote.textContent =
      state.projects.length === 0
        ? "Nothing published yet"
        : state.projects.length + (state.projects.length === 1 ? " announcement published · click a card to manage" : " announcements published · click a card to manage");
  }

  function renderProjects() {
    if (state.projects.length === 0) {
      els.list.innerHTML =
        '<div class="empty-state">' +
        '<div class="icon-ring"><i data-lucide="megaphone"></i></div>' +
        "<h3>No announcements yet</h3>" +
        "<p>Publish your first research announcement and students will start requesting to join.</p>" +
        "</div>";
      icons();
      return;
    }

    els.list.innerHTML = state.projects.map(function (p, idx) {
      var pending = p.applications.filter(function (a) { return a.status === "PENDING"; });
      var joined = p.applications.filter(function (a) { return a.status === "JOINED"; });
      var open = state.open.has(p.id);

      /* ---- join requests ---- */
      var requestsHtml = pending.length
        ? pending.map(function (a) {
            return (
              '<div class="request-row">' +
              '<div class="avatar">' + escapeHtml(initials(a.studentName)) + "</div>" +
              '<div class="who"><b>' + escapeHtml(a.studentName) + "</b><span>" + escapeHtml(a.studentEmail || "") + "</span></div>" +
              '<div class="actions">' +
              '<button class="btn btn-soft btn-sm" data-approve="' + a.id + '"><i data-lucide="check"></i><span>Approve</span></button>' +
              '<button class="btn btn-danger btn-sm" data-decline="' + a.id + '"><i data-lucide="x"></i></button>' +
              "</div></div>"
            );
          }).join("")
        : '<div class="mini-empty">No pending requests right now.</div>';

      /* ---- team + tasks ---- */
      var teamHtml = joined.length
        ? joined.map(function (a) {
            var memberTasks = p.tasks.filter(function (t) { return t.studentId === a.studentId; });
            var tasksHtml = memberTasks.length
              ? memberTasks.map(function (t) {
                  return (
                    '<div class="member-task">' +
                    "<div><b>" + escapeHtml(t.title) + "</b>" +
                    (t.goalDescription ? "<small>" + escapeHtml(t.goalDescription) + "</small>" : "") +
                    "</div>" +
                    '<span class="pill" data-status="' + t.status + '">' + statusLabel(t.status) + "</span>" +
                    "</div>"
                  );
                }).join("")
              : '<div class="mini-empty">No tasks assigned yet.</div>';

            return (
              '<div class="member-block">' +
              '<div class="member-head">' +
              '<div class="avatar">' + escapeHtml(initials(a.studentName)) + "</div>" +
              "<div><b>" + escapeHtml(a.studentName) + "</b><br /><span>" + escapeHtml(a.studentEmail || "") + "</span></div>" +
              '<div class="grow"></div>' +
              '<button class="btn btn-danger btn-sm" data-decline="' + a.id + '" title="Remove from project"><i data-lucide="user-minus"></i></button>' +
              "</div>" +
              '<div class="member-tasks">' +
              tasksHtml +
              '<form class="assign-form" data-project="' + p.id + '" data-student="' + a.studentId + '">' +
              '<input name="title" placeholder="New task title…" required minlength="3" />' +
              '<textarea name="goalDescription" placeholder="Goal description (optional)…"></textarea>' +
              '<div class="row-end"><button class="btn btn-ink btn-sm" type="submit"><i data-lucide="plus"></i><span>Assign task</span></button></div>' +
              "</form>" +
              "</div></div>"
            );
          }).join("")
        : '<div class="mini-empty">No students have joined yet. Approve a request to build the team.</div>';

      return (
        '<article class="p-card' + (open ? " open" : "") + '" style="animation-delay:' + idx * 60 + 'ms">' +
        '<button class="p-card-head" data-toggle="' + p.id + '">' +
        '<div class="titles">' +
        '<div class="top"><span class="badge" data-cat="' + escapeHtml(p.category) + '">' + escapeHtml(p.category) + "</span><h3>" + escapeHtml(p.title) + "</h3></div>" +
        '<div class="sub">' +
        "<span><i data-lucide=\"calendar\"></i>" + fmtDate(p.createdAt) + "</span>" +
        "</div></div>" +
        '<div class="counts">' +
        '<span class="count-tag' + (pending.length ? " hot" : "") + '"><i data-lucide="inbox"></i>' + pending.length + " pending</span>" +
        '<span class="count-tag"><i data-lucide="users"></i>' + joined.length + " joined</span>" +
        '<span class="count-tag"><i data-lucide="list-checks"></i>' + p.tasks.length + " tasks</span>" +
        "</div>" +
        '<span class="chev"><i data-lucide="chevron-down"></i></span>' +
        "</button>" +
        '<div class="p-card-body">' +
        '<div class="p-col"><h4><i data-lucide="inbox"></i>Join requests</h4>' + requestsHtml + "</div>" +
        '<div class="p-col"><h4><i data-lucide="users"></i>Team &amp; tasks</h4>' + teamHtml + "</div>" +
        "</div></article>"
      );
    }).join("");

    icons();
  }

  function render() {
    renderStats();
    renderProjects();
  }

  /* --------------------- Data loading ------------------ */
  async function load() {
    els.list.innerHTML = '<div class="skel-row"></div><div class="skel-row"></div><div class="skel-row"></div>';
    try {
      var data = await apiFetch("/api/projects/mine");
      state.projects = data.projects;
      render();
    } catch (err) {
      els.list.innerHTML =
        '<div class="empty-state"><div class="icon-ring"><i data-lucide="cloud-off"></i></div>' +
        "<h3>Could not load announcements</h3><p>" + escapeHtml(err.message) + "</p></div>";
      icons();
    }
  }

  /* --------------------- Interactions ------------------ */
  els.list.addEventListener("click", function (event) {
    var toggleBtn = event.target.closest("[data-toggle]");
    if (toggleBtn) {
      var id = Number(toggleBtn.getAttribute("data-toggle"));
      if (state.open.has(id)) state.open.delete(id); else state.open.add(id);
      renderProjects();
      return;
    }

    var approveBtn = event.target.closest("[data-approve]");
    if (approveBtn) {
      setButtonLoading(approveBtn, true);
      apiFetch("/api/applications/" + approveBtn.getAttribute("data-approve"), {
        method: "PUT",
        body: { status: "JOINED" },
      })
        .then(function () { toast("Student approved and joined the project."); load(); })
        .catch(function (err) { toast(err.message, "error"); load(); });
      return;
    }

    var declineBtn = event.target.closest("[data-decline]");
    if (declineBtn) {
      setButtonLoading(declineBtn, true);
      apiFetch("/api/applications/" + declineBtn.getAttribute("data-decline"), { method: "DELETE" })
        .then(function () { toast("Request updated."); load(); })
        .catch(function (err) { toast(err.message, "error"); load(); });
    }
  });

  els.list.addEventListener("submit", function (event) {
    var form = event.target.closest(".assign-form");
    if (!form) return;
    event.preventDefault();
    var btn = form.querySelector('button[type="submit"]');
    var title = form.title.value.trim();
    var goal = form.goalDescription.value.trim();
    if (title.length < 3) { toast("Task title must be at least 3 characters.", "error"); return; }
    setButtonLoading(btn, true);
    apiFetch("/api/tasks", {
      method: "POST",
      body: {
        projectId: Number(form.getAttribute("data-project")),
        studentId: Number(form.getAttribute("data-student")),
        title: title,
        goalDescription: goal,
      },
    })
      .then(function () { toast("Task assigned."); load(); })
      .catch(function (err) { toast(err.message, "error"); setButtonLoading(btn, false); });
  });

  /* --------------------- Modal ------------------------- */
  function openModal() {
    els.backdrop.classList.add("show");
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    els.backdrop.classList.remove("show");
    document.body.style.overflow = "";
    els.modalError.classList.remove("show");
  }
  els.openPublish.addEventListener("click", openModal);
  els.closeModal.addEventListener("click", closeModal);
  els.backdrop.addEventListener("click", function (e) { if (e.target === els.backdrop) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  els.publishForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    els.modalError.classList.remove("show");
    var form = els.publishForm;
    var payload = {
      title: form.title.value.trim(),
      description: form.description.value.trim(),
      category: form.querySelector('input[name="category"]:checked').value,
    };
    if (payload.title.length < 4) {
      els.modalError.querySelector("span").textContent = "Please provide a longer title.";
      els.modalError.classList.add("show");
      return;
    }
    if (payload.description.length < 10) {
      els.modalError.querySelector("span").textContent = "Please describe the research briefly (10+ characters).";
      els.modalError.classList.add("show");
      return;
    }
    setButtonLoading(els.publishBtn, true);
    try {
      await apiFetch("/api/projects", { method: "POST", body: payload });
      toast("Announcement published.");
      form.reset();
      closeModal();
      load();
    } catch (err) {
      setButtonLoading(els.publishBtn, false);
      els.modalError.querySelector("span").textContent = err.message;
      els.modalError.classList.add("show");
    }
  });

  /* ------------------------ Boot ------------------------ */
  icons();
  load();
})();
