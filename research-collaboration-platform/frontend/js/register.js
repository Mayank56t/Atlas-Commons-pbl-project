(async function () {
  "use strict";
  redirectIfAuthed();
  icons();

  var form = document.getElementById("registerForm");
  var errorBox = document.getElementById("formError");
  var submitBtn = document.getElementById("submitBtn");
  var roleHint = document.getElementById("roleHint");
  var togglePw = document.getElementById("togglePw");
  var passwordInput = document.getElementById("password");

  togglePw.addEventListener("click", function () {
    var visible = passwordInput.type === "text";
    passwordInput.type = visible ? "password" : "text";
    togglePw.innerHTML = '<i data-lucide="' + (visible ? "eye" : "eye-off") + '"></i>';
    icons();
  });

  form.querySelectorAll('input[name="role"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      var isProf = radio.value === "PROFESSOR" && radio.checked;
      roleHint.className = "role-hint show" + (isProf ? " professor" : " student");
      roleHint.innerHTML = isProf
        ? 'You will <strong>publish research announcements</strong>, review join requests and assign tasks.'
        : 'You will browse announcements and <strong>request to join</strong> projects that match your interests.';
    });
  });

  function showError(msg) {
    errorBox.querySelector("span").textContent = msg;
    errorBox.classList.add("show");
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    errorBox.classList.remove("show");

    var payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value,
      role: form.querySelector('input[name="role"]:checked').value,
    };

    if (payload.name.length < 2) return showError("Please enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))
      return showError("Please enter a valid email address.");
    if (payload.password.length < 6)
      return showError("Password must be at least 6 characters.");

    setButtonLoading(submitBtn, true);

    try {
      var data = await apiFetch("/api/auth/register", { method: "POST", body: payload });
      Auth.save({ token: data.token, role: data.role, name: data.name, email: data.email });
      toast("Account created. Welcome to the commons!");
      window.setTimeout(function () {
        window.location.href = Auth.home(data.role);
      }, 400);
    } catch (err) {
      setButtonLoading(submitBtn, false);
      showError(err.message || "Registration failed. Please try again.");
    }
  });
})();
