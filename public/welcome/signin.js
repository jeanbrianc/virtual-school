// Family sign-in for the landing page. The password is checked at the edge
// (CloudFront Function, see infra/aws/stack.yaml): a correct one returns a
// signed, HttpOnly session cookie, and reloading "/" then serves the school.
(function () {
  'use strict';
  var form = document.getElementById('signin');
  if (!form) return;
  var user = form.elements.username;
  var pass = form.elements.password;
  var status = document.getElementById('signin-status');
  var submit = form.querySelector('button[type="submit"]');
  var reveal = document.getElementById('reveal');

  function say(text, tone) {
    status.textContent = text;
    status.setAttribute('data-tone', tone || '');
  }

  // Browsers send HTTP credentials as UTF-8 → base64.
  function basic(u, p) {
    var bytes = new TextEncoder().encode(u + ':' + p);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return 'Basic ' + btoa(bin);
  }

  function shake() {
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
  }

  reveal.addEventListener('click', function () {
    var show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    reveal.textContent = show ? 'Hide' : 'Show';
    reveal.setAttribute('aria-pressed', String(show));
    pass.focus();
  });

  [user, pass].forEach(function (input) {
    input.addEventListener('input', function () {
      input.removeAttribute('aria-invalid');
      if (status.getAttribute('data-tone') === 'error') say('');
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var u = user.value.trim();
    var p = pass.value;
    if (!u || !p) {
      if (!u) user.setAttribute('aria-invalid', 'true');
      if (!p) pass.setAttribute('aria-invalid', 'true');
      say('Please enter the username and the password.', 'error');
      shake();
      (u ? pass : user).focus();
      return;
    }
    submit.disabled = true;
    say('Opening the school doors…', 'busy');
    fetch('/auth/session', {
      method: 'GET',
      headers: { Authorization: basic(u, p) },
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(function (res) {
        if (res.ok) {
          say('Welcome! Here comes your school…', 'ok');
          window.location.replace('/');
          return;
        }
        submit.disabled = false;
        if (res.status === 401) {
          pass.setAttribute('aria-invalid', 'true');
          say('Hmm, that username or password didn’t work. Try again?', 'error');
          shake();
          pass.select();
        } else {
          say('The school is having trouble right now. Please try again in a minute.', 'error');
        }
      })
      .catch(function () {
        submit.disabled = false;
        say('Couldn’t reach the school. Check the internet connection and try again.', 'error');
      });
  });
})();
