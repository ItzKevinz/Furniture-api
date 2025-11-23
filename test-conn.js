// test-conn.js
require('dotenv').config();
const mysql = require('mysql2/promise');

(async ()=>{
  try{
    const cfg = {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3307),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'db_furniture',
      connectTimeout: 5000
    };
    console.log('Trying connect with config:', {
      host: cfg.host, port: cfg.port, user: cfg.user, database: cfg.database
    });

    const c = await mysql.createConnection(cfg);
    const [rows] = await c.execute('SELECT COUNT(*) AS cnt FROM tbl_furniture');
    console.log('Connection OK. tbl_furniture count =', rows[0].cnt);
    await c.end();
    process.exit(0);
  }catch(e){
    console.error('Connection error:', e.code || '', '-', e.message || e);
    if(e.sqlMessage) console.error('SQL message:', e.sqlMessage);
    process.exit(1);
  }
})();
