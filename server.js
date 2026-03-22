const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ─── Serve Static Files ──────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Database Setup ───────────────────────────────────────
const dbPath = path.join(__dirname, 'chat_users.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
    } else {
        console.log('✅ Connected to SQLite database at:', dbPath);
    }
});

// Create users table (stores User ID + hashed password permanently)
db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT    UNIQUE NOT NULL,
        password TEXT    NOT NULL,
        created_at TEXT  DEFAULT (datetime('now'))
    )
`, (err) => {
    if (err) console.error('Table creation error:', err.message);
    else console.log('✅ Users table ready.');
});

// ─── Track online users ────────────────────────────────────
let onlineUsers = new Map(); // socketId -> username

// ─── Socket.io ────────────────────────────────────────────
io.on('connection', (socket) => {
    let currentUser = null;

    // ── REGISTER ──
    socket.on('register', ({ username, password }, callback) => {
        username = (username || '').trim();
        password = (password || '').trim();

        if (!username || !password) {
            return callback({ success: false, message: 'Username and password are required.' });
        }

        // Check if username already exists
        db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
            if (err) {
                console.error('DB error on register lookup:', err);
                return callback({ success: false, message: 'Server error. Try again.' });
            }
            if (row) {
                return callback({ success: false, message: 'Username already taken. Try a different one.' });
            }

            // Hash password and store
            const hash = bcrypt.hashSync(password, 12);
            db.run(
                'INSERT INTO users (username, password) VALUES (?, ?)',
                [username, hash],
                function (err) {
                    if (err) {
                        console.error('DB insert error:', err);
                        return callback({ success: false, message: 'Could not create account.' });
                    }
                    console.log(`👤 New user registered: ${username} (id: ${this.lastID})`);
                    callback({ success: true, message: 'Account created successfully!' });
                }
            );
        });
    });

    // ── LOGIN ──
    socket.on('login', ({ username, password }, callback) => {
        username = (username || '').trim();

        db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
            if (err) {
                console.error('DB error on login:', err);
                return callback({ success: false, message: 'Server error. Try again.' });
            }
            if (!row) {
                return callback({ success: false, message: 'Invalid username or password.' });
            }

            const valid = bcrypt.compareSync(password, row.password);
            if (!valid) {
                return callback({ success: false, message: 'Invalid username or password.' });
            }

            // Check if this username is already logged in
            const alreadyOnline = [...onlineUsers.values()].includes(username);
            if (alreadyOnline) {
                return callback({ success: false, message: `"${username}" is already in the chat from another session.` });
            }

            // Start ephemeral session
            currentUser = username;
            onlineUsers.set(socket.id, username);
            socket.join('general');

            console.log(`✅ ${currentUser} logged in. Online: ${onlineUsers.size}`);

            // Notify others and broadcast count
            socket.to('general').emit('system_message', `${currentUser} joined the room.`);
            io.to('general').emit('online_count', onlineUsers.size);

            callback({ success: true, username: currentUser });
        });
    });

    // ── CHAT MESSAGE ──
    socket.on('chat_message', (text) => {
        if (!currentUser) return;
        const msg = {
            username: currentUser,
            text: (text || '').slice(0, 1000), // sanitize length
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        io.to('general').emit('chat_message', msg);
    });

    // ── LOGOUT (manual) ──
    socket.on('logout', () => {
        if (currentUser) {
            socket.to('general').emit('system_message', `${currentUser} left the room.`);
            socket.leave('general');
            onlineUsers.delete(socket.id);
            io.to('general').emit('online_count', onlineUsers.size);
            console.log(`👋 ${currentUser} logged out. Online: ${onlineUsers.size}`);
            currentUser = null;
        }
    });

    // ── DISCONNECT (ephemeral session ends) ──
    socket.on('disconnect', () => {
        if (currentUser) {
            io.to('general').emit('system_message', `${currentUser} disconnected.`);
            onlineUsers.delete(socket.id);
            io.to('general').emit('online_count', onlineUsers.size);
            console.log(`🔌 ${currentUser} disconnected. Online: ${onlineUsers.size}`);
            currentUser = null;
        }
    });
});

// ─── Start Server ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 Chat server running at http://localhost:${PORT}\n`);
});
