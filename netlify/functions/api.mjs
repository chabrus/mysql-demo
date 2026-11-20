import mysql from 'mysql2/promise';

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-pass'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 4000,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: true }
    });

    // 1. Получить все записи
    if (event.httpMethod === 'GET') {
      const [rows] = await connection.execute(
        'SELECT id, name, country, created_at FROM notes ORDER BY id DESC'
      );
      return { statusCode: 200, headers, body: JSON.stringify(rows) };
    }

    // 2. Добавить новую запись со страной
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const name = (body.name || '').trim();
      if (!name) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name required' }) };
      }

      // Определяем страну: сначала из Netlify Geo-заголовка, иначе из запроса фронтенда
      let country = body.country || 'Unknown';
      if (event.headers['x-nf-geo']) {
        try {
          const geo = JSON.parse(Buffer.from(event.headers['x-nf-geo'], 'base64').toString('utf-8'));
          if (geo?.country?.name) country = geo.country.name;
        } catch (e) {}
      }

      await connection.execute(
        'INSERT INTO notes (name, country) VALUES (?, ?)',
        [name, country]
      );
      return { statusCode: 201, headers, body: JSON.stringify({ ok: true }) };
    }

    // 3. Удалить запись (только для админа)
    if (event.httpMethod === 'DELETE') {
      const adminPass = event.headers['x-admin-pass'];
      const correctPass = process.env.ADMIN_PASS || 'ruslan2026';
      if (adminPass !== correctPass) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Wrong admin password' }) };
      }

      const body = JSON.parse(event.body || '{}');
      if (!body.id) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'ID required' }) };
      }

      await connection.execute('DELETE FROM notes WHERE id = ?', [body.id]);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  } finally {
    if (connection) await connection.end();
  }
};
