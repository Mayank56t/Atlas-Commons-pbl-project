(async function () {
  "use strict";

  var auth = requireAuth("STUDENT");
  if (!auth) return;

  /* ------------------- Elements ----------------------- */
  var grid = document.getElementById("projectGrid");
  var countNote = document.getElementById("countNote");
  var searchInput = document.getElementById("searchInput");
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
  var progressFill = document.getElementById("progressFill");
  var progressLabel = document.getElementById("progressLabel");

  /* ------------------- Identity ----------------------- */
  document.getElementById("userName").textContent = auth.name;
  document.getElementById("userAvatar").textContent = initials(auth.name);
  var first = auth.name.trim().split(" ")[0];
  var hour = new Date().getHours();
  var day = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  document.getElementById("greeting").innerHTML = "Good " + day + ", <em>" + escapeHtml(first) + "</em>.";
  document.getElementById("logoutBtn").addEventListener("click", Auth.logout);

  /* --------------------- State ------------------------ */
  var state = { projects: [], tasks: [], filter: "All", query: "", joiningId: null };

  /* ------------------ Stats rendering ----------------- */
  function renderStats() {
    var pending = state.projects.filter(function (p) { return p.myApplicationStatus === "PENDING"; }).length;
    var joined = state.projects.filter(function (p) { return p.myApplicationStatus === "JOINED"; }).length;
    document.getElementById("statAvailable").textContent = state.projects.length;
    document.getElementById("statPending").textContent = pending;
    document.getElementById("statJoined").textContent = joined;
    document.getElementById("statTasks").textContent = state.tasks.length;
  }

  /* ---------------- Project grid rendering ------------- */
  function visibleProjects() {
    return state.projects.filter(function (p) {
      var okFilter = state.filter === "All" || p.category === state.filter;
      var q = state.query.toLowerCase();
      var okQuery =
        !q ||
        p.title.toLowerCase().indexOf(q) !== -1 ||
        (p.description || "").toLowerCase().indexOf(q) !== -1 ||
        (p.professorName || "").toLowerCase().indexOf(q) !== -1;
      return okFilter && okQuery;
    });
  }

  function projectAction(p) {
    if (state.joiningId === p.id) {
      return '<button class="btn btn-ghost btn-sm btn-block" disabled><span class="spinner"></span><span>Sending…</span></button>';
    }
    if (p.myApplicationStatus === "JOINED") {
      return '<a class="btn btn-soft btn-sm btn-block" href="#board"><i data-lucide="kanban-square"></i><span>Joined — go to board</span></a>';
    }
    if (p.myApplicationStatus === "PENDING") {
      return '<button class="btn btn-ghost btn-sm btn-block" disabled><i data-lucide="hourglass"></i><span>Request sent — pending</span></button>';
    }
    return '<button class="btn btn-ink btn-sm btn-block" data-join="' + p.id + '"><i data-lucide="plus"></i><span>Request to join</span></button>';
  }

  function renderGrid() {
    var list = visibleProjects();
    countNote.textContent = list.length + (list.length === 1 ? " announcement" : " announcements") +
      (state.filter !== "All" ? " in " + state.filter : "") + (state.query ? ' matching “' + state.query + '”' : "");

    if (list.length === 0) {
      grid.innerHTML =
        '<div class="empty-state">' +
        '<div class="icon-ring"><i data-lucide="telescope"></i></div>' +
        "<h3>No announcements found</h3>" +
        "<p>Try a different category or search term — or check back soon.</p>" +
        "</div>";
      icons();
      return;
    }

    grid.innerHTML = list.map(function (p, idx) {
      return (
        '<article class="project-card" style="animation-delay:' + idx * 55 + 'ms">' +
        '<span class="badge" data-cat="' + escapeHtml(p.category) + '">' + escapeHtml(p.category) + "</span>" +
        "<h3>" + escapeHtml(p.title) + "</h3>" +
        '<p class="desc">' + escapeHtml(p.description) + "</p>" +
        '<div class="card-actions">' + projectAction(p) + "</div>" +
        '<div class="meta">' +
        "<span><i data-lucide=\"user\"></i>" + escapeHtml(p.professorName || "Professor") + "</span>" +
        "<span><i data-lucide=\"users\"></i>" + p.joinedCount + " joined</span>" +
        "<span><i data-lucide=\"calendar\"></i>" + fmtDate(p.createdAt) + "</span>" +
        "</div></article>"
      );
    }).join("");
    icons();
  }

  /* ------------------- Board rendering ------------------ */
  function taskCard(t) {
    var idx = STATUS_ORDER.indexOf(t.status);
    var canBack = idx > 0;
    var canFwd = idx < STATUS_ORDER.length - 1;
    return (
      '<div class="task-card" draggable="true" data-task="' + t.id + '">' +
      '<div class="t-project"><i data-lucide="flask-conical"></i>' + escapeHtml(t.projectTitle || "Project") + "</div>" +
      "<h5>" + escapeHtml(t.title) + "</h5>" +
      (t.goalDescription ? "<p>" + escapeHtml(t.goalDescription) + "</p>" : "") +
      '<div class="t-foot">' +
      '<span class="t-date">' + fmtDate(t.updatedAt) + "</span>" +
      '<span class="move-btns">' +
      '<button data-move="' + t.id + '" data-dir="-1" ' + (canBack ? "" : "disabled") + ' title="Move back"><i data-lucide="arrow-left"></i></button>' +
      '<button data-move="' + t.id + '" data-dir="1" ' + (canFwd ? "" : "disabled") + ' title="Move forward"><i data-lucide="arrow-right"></i></button>' +
      "</span></div></div>"
    );
  }

  function renderBoard() {
    var cols = {
      TO_DO: document.getElementById("col-TO_DO"),
      IN_PROGRESS: document.getElementById("col-IN_PROGRESS"),
      COMPLETED: document.getElementById("col-COMPLETED"),
    };
    STATUS_ORDER.forEach(function (status) {
      var items = state.tasks.filter(function (t) { return t.status === status; });
      cols[status].innerHTML = items.length
        ? items.map(taskCard).join("")
        : '<div class="empty-state"><div class="icon-ring"><i data-lucide="' +
          (status === "COMPLETED" ? "party-popper" : "package-open") +
          '"></i></div><p>' +
          (status === "TO_DO" ? "No tasks waiting" : status === "IN_PROGRESS" ? "Nothing in progress" : "Nothing finished yet") +
          "</p></div>";
    });
    document.getElementById("count-Todo").textContent = state.tasks.filter(function (t) { return t.status === "TO_DO"; }).length;
    document.getElementById("count-Doing").textContent = state.tasks.filter(function (t) { return t.status === "IN_PROGRESS"; }).length;
    document.getElementById("count-Done").textContent = state.tasks.filter(function (t) { return t.status === "COMPLETED"; }).length;

    var done = state.tasks.filter(function (t) { return t.status === "COMPLETED"; }).length;
    var pct = state.tasks.length ? Math.round((done / state.tasks.length) * 100) : 0;
    progressFill.style.width = pct + "%";
    progressLabel.textContent = pct + "% complete";
    icons();
  }

  function render() {
    renderStats();
    renderGrid();
    renderBoard();
  }

  /* --------------------- Data loading ------------------- */
  async function load() {
    grid.innerHTML = '<div class="skel-grid" style="grid-column:1/-1"><div class="skel-card"></div><div class="skel-card"></div><div class="skel-card"></div></div>';
    try {
      var results = await Promise.all([
        apiFetch("/api/projects"),
        apiFetch("/api/tasks"),
      ]);
      state.projects = results[0].projects;
      state.tasks = results[1].tasks;
      render();
    } catch (err) {
      grid.innerHTML =
        '<div class="empty-state"><div class="icon-ring"><i data-lucide="cloud-off"></i></div>' +
        "<h3>Could not load projects</h3><p>" + escapeHtml(err.message) + "</p></div>";
      icons();
    }
  }

  /* ----------------- Join a project --------------------- */
  grid.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-join]");
    if (!btn) return;
    var projectId = Number(btn.getAttribute("data-join"));
    state.joiningId = projectId;
    renderGrid();
    apiFetch("/api/projects/" + projectId + "/join", { method: "POST" })
      .then(function () {
        state.projects.forEach(function (p) { if (p.id === projectId) p.myApplicationStatus = "PENDING"; });
        state.joiningId = null;
        toast("Request sent — the professor will review it.");
        render();
      })
      .catch(function (err) {
        state.joiningId = null;
        toast(err.message, "error");
        load();
      });
  });

  /* ------------------- Filters -------------------------- */
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chips.forEach(function (c) { c.classList.remove("active"); });
      chip.classList.add("active");
      state.filter = chip.getAttribute("data-filter");
      renderGrid();
    });
  });

  searchInput.addEventListener("input", function () {
    state.query = searchInput.value.trim();
    renderGrid();
  });

  /* ------------- Update task status (shared) ------------- */
  async function moveTask(taskId, newStatus, task) {
    task.status = newStatus;
    renderBoard();
    try {
      await apiFetch("/api/tasks/" + taskId + "/status", {
        method: "PUT",
        body: { status: newStatus },
      });
      toast("Task moved to “" + STATUS_LABELS[newStatus] + "”.");
    } catch (err) {
      toast(err.message, "error");
      load();
    }
  }

  /* ---------- Quick-move buttons (accessibility) ---------- */
  document.getElementById("taskBoard").addEventListener("click", function (event) {
    var btn = event.target.closest("[data-move]");
    if (!btn || btn.disabled) return;
    var id = Number(btn.getAttribute("data-move"));
    var dir = Number(btn.getAttribute("data-dir"));
    var task = state.tasks.find(function (t) { return t.id === id; });
    if (!task) return;
    var next = STATUS_ORDER[STATUS_ORDER.indexOf(task.status) + dir];
    if (next) moveTask(id, next, task);
  });

  /* ----------------- Drag & drop board ------------------- */
  var dragId = null;

  document.getElementById("taskBoard").addEventListener("dragstart", function (event) {
    var card = event.target.closest(".task-card");
    if (!card) return;
    dragId = Number(card.getAttribute("data-task"));
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    try { event.dataTransfer.setData("text/plain", String(dragId)); } catch (_) {}
  });

  document.getElementById("taskBoard").addEventListener("dragend", function (event) {
    var card = event.target.closest(".task-card");
    if (card) card.classList.remove("dragging");
    dragId = null;
    document.querySelectorAll(".kanban-col").forEach(function (c) { c.classList.remove("drag-over"); });
  });

  document.getElementById("taskBoard").addEventListener("dragover", function (event) {
    var col = event.target.closest(".kanban-col");
    if (!col) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".kanban-col").forEach(function (c) { c.classList.toggle("drag-over", c === col); });
  });

  document.getElementById("taskBoard").addEventListener("dragleave", function (event) {
    var col = event.target.closest(".kanban-col");
    if (col && !col.contains(event.relatedTarget)) col.classList.remove("drag-over");
  });

  document.getElementById("taskBoard").addEventListener("drop", function (event) {
    var col = event.target.closest(".kanban-col");
    if (!col) return;
    event.preventDefault();
    col.classList.remove("drag-over");
    var target = col.getAttribute("data-col");
    var task = state.tasks.find(function (t) { return t.id === dragId; });
    if (!task || task.status === target) return;
    moveTask(task.id, target, task);
  });

  /* ------------------------ Boot -------------------------- */
  icons();
  load();
})();
