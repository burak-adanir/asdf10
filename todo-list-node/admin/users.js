const db = require('../fw/db');

async function getHtml() {
    let conn = await db.connectDB();
    let html = '';
    let [result] = await conn.execute(
        'SELECT users.ID, users.username, roles.title FROM users inner join permissions on users.ID = permissions.userID inner join roles on permissions.roleID = roles.ID order by username'
    );

    html += `
    <h2>User List</h2>

    <table>
        <tr>
            <th>ID</th>
            <th>Username</th>
            <th>Role</th>
        </tr>`;

    result.map(function (record) {
        html += `<tr><td>`+record.ID+`</td><td>`+record.username+`</td><td>`+record.title+`</td></tr>`;
    });

    html += `
    </table>`;

    return html;
}

module.exports = { html: getHtml };
