(async function () {
  "use strict";
  redirectIfAuthed();
  icons();

  var form = document.getElementById("loginForm");
  var errorBox = document.getElementById("formError");
  var submitBtn = document.getElementById("submitBtn");
  var togglePw = document.getElementById("togglePw");
  var passwordInput = document.getElementById("password");

  togglePw.addEventListener("click", function () {
    var visible = passwordInput.type === "text";
    passwordInput.type = visible ? "password" : "text";
    togglePw.innerHTML = '<i data-lucide="' + (visible ? "eye" : "eye-off") + '"></i>';
    icons();
  });

  function showError(msg) {
    errorBox.querySelector("span").textContent = msg;
    errorBox.classList.add("show");
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    errorBox.classList.remove("show");

    var email = form.email.value.trim();
    var password = form.password.value;

    if (!email || !password) {
      showError("Please fill in your email and password.");
      return;
    }

    setButtonLoading(submitBtn, true);

    try {
      var data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: { email: email, password: password },
      });
      Auth.save({ token: data.token, role: data.role, name: data.name, email: data.email });
      toast("Welcome back, " + data.name.split(" ")[0] + ".");
      window.setTimeout(function () {
        window.location.href = Auth.home(data.role);
      }, 350);
    } catch (err) {
      setButtonLoading(submitBtn, false);
      showError(err.message || "Could not sign in. Please try again.");
    }
  });
})();
