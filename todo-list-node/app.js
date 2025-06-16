const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const header = require('./fw/header');
const footer = require('./fw/footer');
const login = require('./login');
const index = require('./index');
const adminUser = require('./admin/users');
const editTask = require('./edit');
const saveTask = require('./savetask');
const search = require('./search');
const searchProvider = require('./search/v2/index');
// Brute-Force Protection
const { bruteForceProtection } = require('./fw/bf-protection');

const app = express();
const PORT = 3000;

// Middleware für Session-Handling
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));

// Middleware für Body-Parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// Routen
app.get('/', async (req, res) => {
    if (activeUserSession(req)) {
        let html = await wrapContent(await index.html(req), req);
        res.send(html);
    } else {
        res.redirect('login');
    }
});

app.post('/', async (req, res) => {
    if (activeUserSession(req)) {
        let html = await wrapContent(await index.html(req), req);
        res.send(html);
    } else {
        res.redirect('login');
    }
});

// edit task
app.get('/admin/users', async (req, res) => {
    if (activeUserSession(req)) {
        let html = await wrapContent(await adminUser.html, req);
        res.send(html);
    } else {
        res.redirect('/');
    }
});

// edit task
app.get('/edit', async (req, res) => {
    if (activeUserSession(req)) {
        let html = await wrapContent(await editTask.html(req), req);
        res.send(html);
    } else {
        res.redirect('/');
    }
});

// Login-Seite anzeigen mit Brute-Force-Schutz
app.get('/login', bruteForceProtection, async (req, res) => {
    console.log('Content before');
    let content = await login.handleLogin(req, res);
    if (content.user.userid !== 0) {
        // login was successful... set cookies/session and redirect to /
        login.startUserSession(req, res, content.user);
    } else {
        // login unsuccessful or not made yet... display login form
        let html = await wrapContent(content.html, req);
        res.send(html);
    }
});

// Login via POST with Brute-Force Protection
app.post('/login', bruteForceProtection, async (req, res) => {
    console.log('Content before');
    let content = await login.handleLogin(req, res);
    if (content.user.userid !== 0) {
        login.startUserSession(req, res, content.user);
    } else {
        let html = await wrapContent(content.html, req);
        res.send(html);
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.cookie('username', '');
    res.cookie('userid', '');
    res.redirect('/login');
});

// Profilseite anzeigen
app.get('/profile', (req, res) => {
    if (req.session.loggedin) {
        res.send(`Welcome, ${req.session.username}! <a href="/logout">Logout</a>`);
    } else {
        res.send('Please login to view this page');
    }
});

// save task
app.post('/savetask', async (req, res) => {
    if (activeUserSession(req)) {
        let html = await wrapContent(await saveTask.html(req), req);
        res.send(html);
    } else {
        res.redirect('/');
    }
});

// search
app.post('/search', async (req, res) => {
    let html = await search.html(req);
    res.send(html);
});

// search provider
app.get('/search/v2/', async (req, res) => {
    let result = await searchProvider.search(req);
    res.send(result);
});

// Logs anzeigen – nur für eingeloggte Admins
app.get('/admin/logs/failed-logins', async (req, res) => {
    if (!activeUserSession(req) /* || !req.cookies.isAdmin */) {
        return res.status(403).send('Forbidden');
    }
    const logPath = path.join(__dirname, 'logs', 'failed-logins.log');
    fs.readFile(logPath, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Fehler beim Laden der Logs');
        }
        res.send(`<h2>Failed-Logins</h2><pre>${data}</pre>`);
    });
});

// Server starten
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

async function wrapContent(content, req) {
    let headerHtml = await header(req);
    return headerHtml + content + footer;
}

function activeUserSession(req) {
    // prefer session information but fall back to cookies
    console.log('in activeUserSession');
    console.log(req.cookies);
    if (req.session && req.session.loggedin) {
        return true;
    }
    return (
        req.cookies !== undefined &&
        req.cookies.username !== undefined &&
        req.cookies.username !== ''
    );
}