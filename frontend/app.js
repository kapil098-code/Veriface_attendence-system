(() => {
  let authToken = null;
  let needsSetup = false;
  let mediaStream = null;

  const authScreen = document.getElementById('auth-screen');
  const dashboardShell = document.getElementById('dashboard-shell');
  const authForm = document.getElementById('auth-form');
  const authSubtitle = document.getElementById('auth-subtitle');
  const authError = document.getElementById('auth-error');
  const setupNameGroup = document.getElementById('setup-name-group');

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    const res = await fetch(`/api${path}`, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function renderTextCell(tr, value, className = '') {
    const td = document.createElement('td');
    td.textContent = value == null ? '' : String(value);
    if (className) td.className = className;
    tr.appendChild(td);
  }

  async function loadDashboard() {
    const [summary, logs, usersRes] = await Promise.all([
      apiFetch('/reports/summary'),
      apiFetch('/attendance'),
      apiFetch('/users'),
    ]);

    document.getElementById('kpi-present').textContent = summary.today.checked_in;
    document.getElementById('kpi-late').textContent = summary.today.late;
    document.getElementById('kpi-absent').textContent = summary.today.absent;
    document.getElementById('kpi-rate').textContent = `${summary.today.attendance_pct}%`;

    const logsTbody = document.getElementById('logs-tbody');
    logsTbody.textContent = '';
    for (const r of logs.records) {
      const tr = document.createElement('tr');
      renderTextCell(tr, r.name);
      renderTextCell(tr, r.roll_no, 'mono');
      renderTextCell(tr, r.department_name);
      renderTextCell(tr, r.date, 'mono');
      renderTextCell(tr, r.time_in, 'mono');
      renderTextCell(tr, r.status);
      renderTextCell(tr, `${(r.confidence_score * 100).toFixed(1)}%`, 'mono');
      logsTbody.appendChild(tr);
    }

    const deptTbody = document.getElementById('dept-tbody');
    deptTbody.textContent = '';
    for (const d of summary.departmentSummary) {
      const tr = document.createElement('tr');
      renderTextCell(tr, d.department_name);
      renderTextCell(tr, d.member_count, 'mono');
      renderTextCell(tr, d.present_today, 'mono');
      renderTextCell(tr, d.absent_today, 'mono');
      renderTextCell(tr, `${d.range_rate_pct}%`, 'mono');
      deptTbody.appendChild(tr);
    }

    const usersTbody = document.getElementById('users-tbody');
    usersTbody.textContent = '';
    for (const u of usersRes.users) {
      const tr = document.createElement('tr');
      renderTextCell(tr, u.name);
      renderTextCell(tr, u.roll_no, 'mono');
      renderTextCell(tr, u.department_name);
      renderTextCell(tr, u.role);
      renderTextCell(tr, u.registered_on, 'mono');
      usersTbody.appendChild(tr);
    }
  }

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value;

    try {
      const data = needsSetup
        ? await apiFetch('/auth/setup', {
            method: 'POST',
            body: JSON.stringify({ name, email, password }),
          })
        : await apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
      authToken = data.token;
      authScreen.classList.add('hidden');
      dashboardShell.classList.remove('hidden');
      await loadDashboard();
    } catch (err) {
      authError.textContent = err.message;
      authError.classList.remove('hidden');
    }
  });

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-view');
      document.getElementById('view-title').textContent = btn.textContent;
      document.querySelectorAll('.view-panel').forEach((panel) => {
        panel.classList.toggle('hidden', panel.id !== `view-${target}`);
      });
    });
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    authToken = null;
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }
    dashboardShell.classList.add('hidden');
    authScreen.classList.remove('hidden');
  });

  document.getElementById('start-cam-btn').addEventListener('click', async () => {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      document.getElementById('cam-video').srcObject = mediaStream;
      document.getElementById('cam-status').textContent = 'Camera stream active.';
    } catch (err) {
      document.getElementById('cam-status').textContent = `Camera error: ${err.message}`;
    }
  });

  document.getElementById('stop-cam-btn').addEventListener('click', () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    document.getElementById('cam-video').srcObject = null;
    document.getElementById('cam-status').textContent = 'Webcam stopped.';
  });

  document.getElementById('export-csv-btn').addEventListener('click', async () => {
    const res = await fetch('/api/attendance/export', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  apiFetch('/auth/status').then((status) => {
    needsSetup = status.needsSetup;
    if (needsSetup) {
      authSubtitle.textContent = 'Initial Administrator Setup';
      setupNameGroup.classList.remove('hidden');
    }
  });
})();
