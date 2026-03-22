const socket = io();

// ---- Screen references ----
const loginScreen    = document.getElementById('login-screen');
const registerScreen = document.getElementById('register-screen');
const chatScreen     = document.getElementById('chat-screen');

// ---- Login form ----
const loginForm      = document.getElementById('login-form');
const loginUsername  = document.getElementById('login-username');
const loginPassword  = document.getElementById('login-password');
const loginAlert     = document.getElementById('login-alert');

// ---- Register form ----
const registerForm   = document.getElementById('register-form');
const regUsername    = document.getElementById('reg-username');
const regPassword    = document.getElementById('reg-password');
const regConfirm     = document.getElementById('reg-confirm');
const registerAlert  = document.getElementById('register-alert');

// ---- Chat ----
const sidebarUsername   = document.getElementById('sidebar-username');
const sidebarAvatar     = document.getElementById('sidebar-avatar');
const btnLogout         = document.getElementById('btn-logout');
const messagesArea      = document.getElementById('messages-area');
const chatForm          = document.getElementById('chat-form');
const messageInput      = document.getElementById('message-input');
const onlineCount       = document.getElementById('online-count');

let currentUser = null;

// ===========================
//   Screen navigation
// ===========================
function showScreen(name) {
    [loginScreen, registerScreen, chatScreen].forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    const target = document.getElementById(name + '-screen');
    target.classList.remove('hidden');
    target.classList.add('active');
}

document.getElementById('go-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    hideAlert(loginAlert);
    showScreen('register');
});

document.getElementById('go-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    hideAlert(registerAlert);
    showScreen('login');
});

// ===========================
//   Alert helpers
// ===========================
function showAlert(el, msg, type = 'error') {
    el.textContent = msg;
    el.className = `alert ${type}`;
}
function hideAlert(el) {
    el.className = 'alert hidden';
}

// ===========================
//   Register
// ===========================
registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideAlert(registerAlert);

    const username = regUsername.value.trim();
    const password = regPassword.value.trim();
    const confirm  = regConfirm.value.trim();

    if (!username || !password || !confirm) return showAlert(registerAlert, 'All fields are required.');
    if (password.length < 6)               return showAlert(registerAlert, 'Password must be at least 6 characters.');
    if (password !== confirm)              return showAlert(registerAlert, 'Passwords do not match.');

    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    socket.emit('register', { username, password }, (res) => {
        btn.disabled = false;
        btn.textContent = 'Create Account';
        if (res.success) {
            showAlert(registerAlert, '✔ Account created! Redirecting to login...', 'success');
            regUsername.value = '';
            regPassword.value = '';
            regConfirm.value  = '';
            setTimeout(() => { hideAlert(registerAlert); showScreen('login'); }, 2000);
        } else {
            showAlert(registerAlert, res.message);
        }
    });
});

// ===========================
//   Login
// ===========================
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideAlert(loginAlert);

    const username = loginUsername.value.trim();
    const password = loginPassword.value.trim();

    if (!username || !password) return showAlert(loginAlert, 'Please enter your username and password.');

    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    socket.emit('login', { username, password }, (res) => {
        btn.disabled = false;
        btn.textContent = 'Login';
        if (res.success) {
            currentUser = res.username;
            sidebarUsername.textContent = res.username;
            sidebarAvatar.textContent = res.username.charAt(0).toUpperCase();
            loginUsername.value = '';
            loginPassword.value = '';
            showScreen('chat');
        } else {
            showAlert(loginAlert, res.message);
        }
    });
});

// ===========================
//   Logout / Disconnect
// ===========================
btnLogout.addEventListener('click', () => {
    socket.emit('logout');
    resetToLogin();
});

socket.on('disconnect', () => {
    if (currentUser) {
        resetToLogin();
    }
});

function resetToLogin() {
    currentUser = null;
    // Clear messages except welcome
    messagesArea.innerHTML = `
        <div class="welcome-msg">
            <div class="welcome-icon">🔒</div>
            <p>This is an ephemeral session. Messages are not stored. Once you disconnect, your session ends.</p>
        </div>`;
    showScreen('login');
    showAlert(loginAlert, '⏱ Session ended. Please log in again to rejoin.', 'error');
}

// ===========================
//   Chat Messages
// ===========================
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if (!msg) return;
    socket.emit('chat_message', msg);
    messageInput.value = '';
    messageInput.focus();
});

socket.on('chat_message', (data) => {
    const isOwn = data.username === currentUser;
    const row = document.createElement('div');
    row.className = `msg-row ${isOwn ? 'own' : 'other'}`;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = data.text;

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.innerHTML = isOwn
        ? `<span>${data.time}</span>`
        : `<span><strong>${data.username}</strong></span><span>${data.time}</span>`;

    // --- Countdown Timer ---
    const DURATION = 10;
    const circumference = 38; // matches stroke-dasharray in CSS

    const timerEl = document.createElement('div');
    timerEl.className = 'msg-timer';
    timerEl.innerHTML = `
        <div class="timer-ring" id="ring-${Date.now()}">
            <svg viewBox="0 0 14 14">
                <circle class="ring-bg" cx="7" cy="7" r="6"/>
                <circle class="ring-progress" cx="7" cy="7" r="6"/>
            </svg>
        </div>
        <span class="timer-seconds">${DURATION}s</span>
    `;

    const ring = timerEl.querySelector('.timer-ring');
    const ringProgress = timerEl.querySelector('.ring-progress');
    const secondsDisplay = timerEl.querySelector('.timer-seconds');

    // Build message DOM
    if (isOwn) {
        row.appendChild(bubble);
        row.appendChild(meta);
        row.appendChild(timerEl);
    } else {
        row.appendChild(meta);
        row.appendChild(bubble);
        row.appendChild(timerEl);
    }

    // Remove welcome message if present
    const welcome = messagesArea.querySelector('.welcome-msg');
    if (welcome) welcome.remove();

    messagesArea.appendChild(row);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    // Run countdown
    let remaining = DURATION;
    const interval = setInterval(() => {
        remaining--;
        secondsDisplay.textContent = `${remaining}s`;

        // Update ring
        const offset = circumference * (1 - remaining / DURATION);
        ringProgress.style.strokeDashoffset = offset;

        // Color warnings
        if (remaining <= 3) {
            ring.className = 'timer-ring danger';
            secondsDisplay.className = 'timer-seconds danger';
        } else if (remaining <= 6) {
            ring.className = 'timer-ring warning';
            secondsDisplay.className = 'timer-seconds warning';
        }

        if (remaining <= 0) {
            clearInterval(interval);
            row.classList.add('expiring');
            setTimeout(() => row.remove(), 800);
        }
    }, 1000);
});

socket.on('system_message', (msg) => {
    const el = document.createElement('div');
    el.className = 'system-msg';
    el.textContent = msg;
    messagesArea.appendChild(el);
    messagesArea.scrollTop = messagesArea.scrollHeight;
});

socket.on('online_count', (count) => {
    onlineCount.textContent = `${count} online`;
});
