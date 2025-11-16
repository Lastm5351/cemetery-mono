const pool = require('../config/database')
const bcrypt = require('bcryptjs')

const _trimmed = v => (typeof v === 'string' ? v.trim() : v)

async function addUser(req, res, next) {
  try {
    const {
      username, email, first_name, last_name,
      phone, address, role = 'admin',
      is_active = 1, password_str
    } = req.body
    const hashedPassword = await bcrypt.hash(password_str, 10)
    const sql = `
      INSERT INTO users
        (username,email,first_name,last_name,phone,address,role,is_active,password_str,password_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id,username,email,first_name,last_name,phone,address,role,is_active,created_at
    `
    const values = [
      _trimmed(username), _trimmed(email), _trimmed(first_name), _trimmed(last_name),
      _trimmed(phone), _trimmed(address), _trimmed(role),
      Number(is_active) ? 1 : 0,
      password_str, hashedPassword
    ]
    const { rows } = await pool.query(sql, values)
    res.status(201).json({ success: true, message: 'User added successfully', user: rows[0] })
  } catch (err) {
    next(err)
  }
}

async function users(req, res, next) {
  try {
    const meId = req.user?.id || req.user?.user_id || req.user?.sub
    if (!meId) return res.status(400).json({ success: false, message: 'Missing authenticated user id.' })
    const sql = `
      SELECT id,uid,username,email,first_name,last_name,phone,address,role,is_active,password_str,
             COALESCE(created_at,NOW()) AS created_at
      FROM users
      WHERE id <> $1
      ORDER BY created_at DESC
    `
    const { rows } = await pool.query(sql, [meId])
    res.json({ success: true, users: rows })
  } catch (err) {
    next(err)
  }
}

async function updateUser(req, res, next) {
  try {
    const userId = req.params.id
    if (!userId) return res.status(400).json({ success: false, message: 'Missing user id.' })

    const {
      username, email, first_name, last_name,
      phone, address, is_active, role, password_str
    } = req.body

    const sets = [], vals = []
    let idx = 1
    const _trimmed = v => (typeof v === 'string' ? v.trim() : v)
    const push = (col, val, t = x => x) => {
      if (typeof val !== 'undefined') {
        sets.push(`${col} = $${idx++}`)
        vals.push(t(val))
      }
    }

    push('username', username, _trimmed)
    push('email', email, _trimmed)
    push('first_name', first_name, _trimmed)
    push('last_name', last_name, _trimmed)
    push('phone', phone, _trimmed)
    push('address', address, _trimmed)
    push('role', role, _trimmed)
    if (typeof is_active !== 'undefined') push('is_active', is_active, v => (Number(v) ? 1 : 0))

    if (typeof password_str !== 'undefined' && `${password_str}`.trim()) {
      const hashed = await bcrypt.hash(`${password_str}`.trim(), 10)
      sets.push(`password_str = $${idx++}`)
      vals.push(`${password_str}`.trim())
      sets.push(`password_hash = $${idx++}`)
      vals.push(hashed)
    }

    sets.push(`updated_at = NOW()`)
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update.' })

    const sql = `
      UPDATE users
      SET ${sets.join(', ')}
      WHERE id = $${idx}
      RETURNING id,uid,username,email,first_name,last_name,phone,address,role,
                is_active,password_str,created_at,updated_at
    `
    vals.push(userId)

    const { rows } = await pool.query(sql, vals)
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' })
    res.json({ success: true, message: 'User updated successfully', user: rows[0] })
  } catch (err) {
    next(err)
  }
}

async function deleteUser(req, res, next) {
  try {
    const userId = req.params.id
    if (!userId) return res.status(400).json({ success: false, message: 'Missing user id.' })
    const meId = req.user?.id || req.user?.user_id || req.user?.sub
    if (`${meId}` === `${userId}`) return res.status(403).json({ success: false, message: 'Cannot delete self.' })
    const { rows } = await pool.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [userId])
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' })
    res.json({ success: true, message: 'User deleted' })
  } catch (err) { next(err) }
}

async function saveCemeteryInfo(req, res, next) {
  try {
    const { name, address, slogan, description } = req.body;

    if (!name || !address) {
      return res.status(400).json({ success: false, message: 'name and address are required.' });
    }

    // If you use multer: upload.single('logo') – get file info here
    // Decide how to store the URL/path. Adjust as needed.
    let incomingLogoUrl = null;
    if (req.file) {
      // Example: put uploaded files under /uploads/logos/<filename>
      // req.file.path is filesystem path; store a public-facing URL/path your app serves
      const fname = req.file.filename || '';
      incomingLogoUrl = `/uploads/logos/${fname}`;
    }

    // Build params
    const params = [
      _trimmed(name),
      _trimmed(address),
      _trimmed(slogan || ''),
      _trimmed(description || ''),
      incomingLogoUrl,
    ];

    // Upsert row id=1. If logo not provided, keep existing cemetery_info.logo_url.
    const sql = `
      INSERT INTO cemetery_info (id, name, address, slogan, description, logo_url)
      VALUES (1, $1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        slogan = EXCLUDED.slogan,
        description = EXCLUDED.description,
        logo_url = COALESCE(EXCLUDED.logo_url, cemetery_info.logo_url),
        updated_at = NOW()
      RETURNING id, name, address, slogan, description, logo_url, created_at, updated_at
    `;

    const { rows } = await pool.query(sql, params);
    return res.json({ success: true, message: 'Cemetery info saved.', data: rows[0] });
  } catch (err) {
    next(err);
  }
}


module.exports = { addUser, users, updateUser, deleteUser, saveCemeteryInfo }
