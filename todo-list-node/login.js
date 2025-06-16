const db = require('./fw/db');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy'); // for MFA
const { recordFailure, resetAttempts } = require('./fw/bf-protection');

async function handleLogin(req, res) {
    let msg = '';
    let user = { username: '', userid: 0 };

    const username = req.body.username || req.query.username;
    const password = req.body.password || req.query.password;
    const mfaCode  = req.body.mfaCode  || req.query.mfaCode;

    if (typeof username !== 'undefined' && typeof password !== 'undefined') {
        console.log('Validating login for', username);
        const result = await validateLogin(username, password);
        console.log('Validation result:', result);

        if (result.valid) {
            if (result.mfaEnabled) {
                // MFA flow
                if (!mfaCode) {
                    // Prompt for MFA code
                    msg = getHtml(true, username, password);
                    return { html: msg, user };
                } else {
                    const verified = speakeasy.totp.verify({
                        secret: result.mfaSecret,
                        encoding: 'base32',
                        token: mfaCode
                    });
                    if (verified) {
                        resetAttempts(req); // Successful MFA
                        user.username = username;
                        user.userid = result.userId;
                        return { html: msg, user };
                    } else {
                        recordFailure(req); // Failed MFA
                        msg = 'Invalid MFA code. Try again.';
                        return { html: msg + getHtml(true, username, password), user };
                    }
                }
            } else {
                // No MFA
                resetAttempts(req);
                user.username = username;
                user.userid = result.userId;
                return { html: msg, user };
            }
        } else {
            // Invalid login
            recordFailure(req);
            msg = result.msg;
        }
    } else {
        msg = 'Please enter username and password';
    }

    return { html: msg + getHtml(false, username, ''), user };
}

function startUserSession(req, res, user) {
    console.log('Starting session for user', user.userid);
    // persist login details inside the session too
    if (req.session) {
        req.session.loggedin = true;
        req.session.username = user.username;
        req.session.userid   = user.userid;
    }
    res.cookie('username', user.username, { httpOnly: true });
    res.cookie('userid', user.userid, { httpOnly: true });
    res.redirect('/');
}

async function validateLogin(username, password) {
    const result = { valid: false, msg: '', userId: 0, mfaEnabled: false, mfaSecret: '' };
    const dbConnection = await db.connectDB();

    try {
        // Use parameterized query to prevent SQL injection
        const [rows] = await dbConnection.execute(
            `SELECT id, username, password, mfa_enabled, mfa_secret FROM users WHERE username = ?`,
            [username]
        );

        if (rows.length > 0) {
            const user = rows[0];
            const stored = user.password || '';
            let passOk = false;
            if (stored.startsWith('$2')) {
                passOk = await bcrypt.compare(password, stored);
            } else {
                passOk = stored === password;
            }

            if (passOk) {
                result.valid      = true;
                result.userId     = user.id;
                result.msg        = 'login correct';
                result.mfaEnabled = Boolean(user.mfa_enabled);
                result.mfaSecret  = user.mfa_secret;
            } else {
                result.msg = 'Incorrect password';
            }
        } else {
            result.msg = 'Username does not exist';
        }
        console.log(rows);
    } catch (err) {
        console.error('DB error:', err);
        result.msg = 'Internal error';
    } finally {
        if (dbConnection) {
            await dbConnection.end(); // Or .release() if using pool
        }
    }

    return result;
}

function getHtml(showMfa, username = '', password = '') {
    if (showMfa) {
        return `
        <h2>Enter MFA Code</h2>
        <form method="post" action="/login">
            <input type="hidden" name="username" value="${username}">
            <input type="hidden" name="password" value="${password}">
            <div class="form-group">
                <label for="mfaCode">MFA Code</label>
                <input type="text" class="form-control" name="mfaCode" id="mfaCode" autofocus>
            </div>
            <div class="form-group">
                <input type="submit" class="btn" value="Verify">
            </div>
        </form>`;
    }
    return `
    <h2>Login</h2>
    <form id="form" method="post" action="/login">
        <div class="form-group">
            <label for="username">Username</label>
            <input type="text" class="form-control size-medium" name="username" id="username" value="${username}">
        </div>
        <div class="form-group">
            <label for="password">Password</label>
            <input type="password" class="form-control size-medium" name="password" id="password" value="${password}">
        </div>
        <div class="form-group">
            <input id="submit" type="submit" class="btn size-auto" value="Login" />
        </div>
    </form>`;
}

module.exports = {
    handleLogin,
    startUserSession
};
