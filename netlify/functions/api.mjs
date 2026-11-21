import mysql from 'mysql2/promise';

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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
        'SELECT id, name, country, COALESCE(likes, 0) AS likes, created_at FROM notes ORDER BY id DESC'
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

      let country = body.country || 'Uzbekistan';
      if (event.headers['x-nf-geo']) {
        try {
          const geo = JSON.parse(Buffer.from(event.headers['x-nf-geo'], 'base64').toString('utf-8'));
          if (geo?.country?.name) country = geo.country.name;
        } catch (e) {}
      }

      await connection.execute(
        'INSERT INTO notes (name, country, likes) VALUES (?, ?, 0)',
        [name, country]
      );
      return { statusCode: 201, headers, body: JSON.stringify({ ok: true }) };
    }

    // 3. Поставить или снять лайк
    if (event.httpMethod === 'PATCH') {
      const body = JSON.parse(event.body || '{}');
      const id = Number(body.id);
      if (!id) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'ID required' }) };
      }

      const delta = body.action === 'unlike' ? -1 : 1;
      await connection.execute(
        'UPDATE notes SET likes = GREATEST(0, COALESCE(likes, 0) + ?) WHERE id = ?',
        [delta, id]
      );

      const [rows] = await connection.execute(
        'SELECT COALESCE(likes, 0) AS likes FROM notes WHERE id = ?',
        [id]
      );
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, likes: rows[0]?.likes ?? 0 })
      };
    }

    // 4. Удалить запись (только для админа)
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
