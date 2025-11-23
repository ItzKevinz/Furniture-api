// server.js
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


const app = express();

app.use(cors());
app.use(express.json()); // parse JSON

// --- MySQL config (env or defaults) ---
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10); // adjust default 3306
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';
const DB_NAME = process.env.DB_NAME || 'db_furniture';

async function getConnection() {
  try {
    const conn = await mysql.createConnection({
      host: DB_HOST, port: DB_PORT,
      user: DB_USER, password: DB_PASS, database: DB_NAME
    });
    return conn;
  } catch (err) {
    console.warn('MySQL connection failed:', err.message);
    return null;
  }
}

function sendError(res, status, message) { return res.status(status).json({ ok: false, message }); }

// --- Multer file upload setup ---
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // safe filename: timestamp-originalname (spaces replaced)
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
    cb(null, safeName);
  }
});

function fileFilter (req, file, cb) {
  const allowed = /jpeg|jpg|png|webp/;
  const ok = allowed.test(file.mimetype) || allowed.test(path.extname(file.originalname).toLowerCase());
  cb(null, ok);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// serve uploads statically
app.use('/uploads', express.static(UPLOAD_DIR));

// ----------------- API Endpoints -----------------

// GET list — menampilkan semua produk dari tbl_furniture
app.get('/api/products', async (req, res) => {
  const conn = await getConnection();
  if (!conn) return res.status(500).json({ ok: false, message: 'DB connection failed' });

  try {
    const [rows] = await conn.execute(`
      SELECT
        id_furniture,
        nama_furniture,
        kategori,
        bahan,
        harga,
        stok,
        dimensi,
        warna,
        image
      FROM tbl_furniture
      ORDER BY id_furniture ASC
    `);
    await conn.end();
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// GET single product by id_furniture
app.get('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  const conn = await getConnection();
  if (!conn) return res.status(500).json({ ok: false, message: 'DB connection failed' });

  try {
    const [rows] = await conn.execute(`
      SELECT
        id_furniture,
        nama_furniture,
        kategori,
        bahan,
        harga,
        stok,
        dimensi,
        warna,
        image
      FROM tbl_furniture
      WHERE id_furniture = ?
      LIMIT 1
    `, [id]);

    await conn.end();
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Not found' });

    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// protected helpers
function checkToken(req) {
  // Bisa dikirim lewat x-auth-token atau Authorization: Bearer xxx
  const raw =
    req.headers['x-auth-token'] ||
    req.headers['authorization'] ||
    '';

  const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;

  if (!token) return null;

  try {
    const payload = jwt.verify(token, 'SECRETKEY123'); // sama dengan di /api/login
    return payload; // { id, username }
  } catch (err) {
    console.warn('Invalid token:', err.message);
    return null;
  }
}


// POST create
app.post('/api/products', async (req, res) => {
  if (!checkToken(req)) return sendError(res, 401, 'Unauthorized');

  // Accept fields matching your table
  const {
    id_furniture, nama_furniture, kategori, bahan,
    harga, stok, dimensi, warna, image
  } = req.body || {};

  if (!id_furniture || !nama_furniture) return sendError(res, 400, 'id_furniture and nama_furniture required');

  const conn = await getConnection();
  if (!conn) return sendError(res, 500, 'DB connection failed');

  try {
    const [r] = await conn.execute(
      `INSERT INTO tbl_furniture
        (id_furniture, nama_furniture, kategori, bahan, harga, stok, dimensi, warna, image)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id_furniture, nama_furniture, kategori || null, bahan || null,
        harga != null ? Number(harga) : null,
        stok != null ? Number(stok) : null,
        dimensi || null, warna || null, image || null
      ]
    );
    await conn.end();
    res.json({ ok: true, insertedId: r.insertId, id_furniture });
  } catch (err) {
    console.error(err);
    sendError(res, 500, err.message);
  }
});

// PUT update by id_furniture
app.put("/api/products/:id", async (req, res) => {
  if (!checkToken(req)) return sendError(res, 401, "Unauthorized");

  const id = req.params.id; // ini adalah id_furniture
  const {
    nama_furniture,
    kategori,
    bahan,
    harga,
    stok,
    dimensi,
    warna,
    image,
  } = req.body || {};

  // minimal ada sesuatu yang diupdate
  if (
    !nama_furniture &&
    !kategori &&
    !bahan &&
    harga == null &&
    stok == null &&
    !dimensi &&
    !warna &&
    !image
  ) {
    return sendError(res, 400, "At least one field required to update");
  }

  const conn = await getConnection();
  if (!conn) return sendError(res, 500, "DB connection failed");

  try {
    const sets = [];
    const params = [];

    if (nama_furniture !== undefined) {
      sets.push("nama_furniture = ?");
      params.push(nama_furniture);
    }
    if (kategori !== undefined) {
      sets.push("kategori = ?");
      params.push(kategori);
    }
    if (bahan !== undefined) {
      sets.push("bahan = ?");
      params.push(bahan);
    }
    if (harga !== undefined) {
      sets.push("harga = ?");
      params.push(Number(harga));
    }
    if (stok !== undefined) {
      sets.push("stok = ?");
      params.push(Number(stok));
    }
    if (dimensi !== undefined) {
      sets.push("dimensi = ?");
      params.push(dimensi);
    }
    if (warna !== undefined) {
      sets.push("warna = ?");
      params.push(warna);
    }
    if (image !== undefined) {
      sets.push("image = ?");
      params.push(image);
    }

    params.push(id); // WHERE id_furniture = ?

    const sql = `UPDATE tbl_furniture SET ${sets.join(
      ", "
    )} WHERE id_furniture = ?`;

    const [r] = await conn.execute(sql, params);
    await conn.end();

    res.json({ ok: true, affected: r.affectedRows });
  } catch (err) {
    console.error(err);
    sendError(res, 500, err.message);
  }
});

// DELETE by id_furniture
app.delete('/api/products/:id', async (req, res) => {
  const user = checkToken(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const id = req.params.id;
  const conn = await getConnection();
  if (!conn) return sendError(res, 500, 'DB connection failed');

  try {
    const [r] = await conn.execute('DELETE FROM tbl_furniture WHERE id_furniture = ?', [id]);
    await conn.end();
    res.json({ ok: true, affected: r.affectedRows });
  } catch (err) {
    console.error(err);
    sendError(res, 500, err.message);
  }
});

// Upload endpoint: multipart/form-data field 'image'
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'No file uploaded' });

    const fileUrl = `/uploads/${req.file.filename}`;
    const { productId } = req.body || {};

    if (productId) {
      const conn = await getConnection();
      if (conn) {
        try {
          await conn.execute('UPDATE tbl_furniture SET image = ? WHERE id_furniture = ?', [fileUrl, productId]);
          await conn.end();
        } catch (err) {
          console.error('Failed to update product image in DB', err);
        }
      }
    }

    res.json({ ok: true, url: fileUrl });
  } catch (err) {
    console.error('Upload error', err);
    res.status(500).json({ ok: false, message: 'Upload failed' });
  }
});


// LOGIN USER + ADMIN

app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ ok: false, message: "Semua field wajib diisi" });
  }

  const conn = await getConnection();
  if (!conn) {
    return res
      .status(500)
      .json({ ok: false, message: "Koneksi DB gagal" });
  }

  try {
    // cek user/email sudah ada
    const [exist] = await conn.execute(
      "SELECT * FROM users WHERE username=? OR email=? LIMIT 1",
      [username, email]
    );
    if (exist.length) {
      return res
        .status(400)
        .json({ ok: false, message: "Username atau Email sudah dipakai" });
    }

    const hash = await bcrypt.hash(password, 10);

    await conn.execute(
      "INSERT INTO users (username, email, password) VALUES (?,?,?)",
      [username, email, hash]
    );

    await conn.end();
    res.json({ ok: true, message: "Registrasi berhasil" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
});



app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ ok: false, message: "Isi username dan password" });
  }

  const conn = await getConnection();
  if (!conn) {
    return res
      .status(500)
      .json({ ok: false, message: "Koneksi DB gagal" });
  }

  try {
    const [rows] = await conn.execute(
      "SELECT * FROM users WHERE username=? LIMIT 1",
      [username]
    );
    await conn.end();

    if (!rows.length) {
      return res
        .status(400)
        .json({ ok: false, message: "User tidak ditemukan" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res
        .status(400)
        .json({ ok: false, message: "Password salah" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      "SECRETKEY123",
      { expiresIn: "7d" }
    );

    res.json({
      ok: true,
      token,
      username: user.username,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
});


// END 🔥 LOGIN + REGISTER BARU

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

const PORT = parseInt(process.env.PORT || '4000', 10);
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`MySQL: ${DB_HOST}:${DB_PORT} DB=${DB_NAME}`);
});
