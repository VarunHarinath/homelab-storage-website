import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import { query } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5050;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_local_homelab_key_123!';

// Set up logger
app.use(morgan('dev'));

// Configure CORS dynamically to allow local network access (including Tailscale/CGNAT IPs)
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://192.168.1.10:5173',
  'http://100.116.13.92:5173',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.includes(origin) ||
      origin.startsWith('http://192.168.') ||
      origin.startsWith('http://100.') ||
      origin.startsWith('http://10.') ||
      origin.startsWith('http://127.0.0.1');

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Ensure external uploads testing directory exists
const extTestDir = process.env.EXTERNAL_UPLOAD_DIR || './external_uploads';
if (!fs.existsSync(extTestDir)) {
  try {
    fs.mkdirSync(extTestDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create default external uploads directory:', err);
  }
}

// Dynamic Storage Target Discovery Function
function getStorageTargets() {
  const targets = [
    { id: 'local', name: 'Local Server Disk', path: uploadDir }
  ];

  if (process.platform === 'darwin') {
    try {
      const volumesDir = '/Volumes';
      if (fs.existsSync(volumesDir)) {
        const dirs = fs.readdirSync(volumesDir);
        dirs.forEach(dir => {
          if (dir !== 'Macintosh HD' && !dir.startsWith('.')) {
            targets.push({
              id: `external-${dir.toLowerCase().replace(/\s+/g, '-')}`,
              name: `External device to server (${dir})`,
              path: path.join(volumesDir, dir)
            });
          }
        });
      }
    } catch (err) {
      console.error('Error scanning macOS Volumes:', err);
    }
  } else if (process.platform === 'linux') {
    try {
      const output = execSync('lsblk -o NAME,MOUNTPOINT,SIZE,TYPE,FSTYPE -J').toString();
      const data = JSON.parse(output);
      
      const traverse = (devices) => {
        if (!devices) return;
        for (const dev of devices) {
          // Verify it has a mount point under /media or /mnt
          if (dev.mountpoint && 
              (dev.mountpoint.startsWith('/media') || dev.mountpoint.startsWith('/mnt'))
          ) {
            const name = dev.name || path.basename(dev.mountpoint);
            targets.push({
              id: `external-${name.toLowerCase().replace(/\s+/g, '-')}`,
              name: `External device to server (${name} - ${dev.size || 'Unknown Size'})`,
              path: dev.mountpoint
            });
          }
          if (dev.children) {
            traverse(dev.children);
          }
        }
      };
      
      if (data && data.blockdevices) {
        traverse(data.blockdevices);
      }
    } catch (err) {
      console.error('Error scanning Linux block devices via lsblk:', err);
      // Fallback manual directory check for /media and /mnt
      const checkDirs = ['/media', '/mnt'];
      checkDirs.forEach(baseDir => {
        try {
          if (fs.existsSync(baseDir)) {
            const subs = fs.readdirSync(baseDir);
            subs.forEach(sub => {
              const fullPath = path.join(baseDir, sub);
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                targets.push({
                  id: `external-${sub.toLowerCase().replace(/\s+/g, '-')}`,
                  name: `External device to server (${sub})`,
                  path: fullPath
                });
              }
            });
          }
        } catch (e) {
          console.error(`Error reading ${baseDir}:`, e);
        }
      });
    }
  }

  // Include default external folder for development/testing if no actual mounts were found
  if (targets.length === 1 && fs.existsSync(extTestDir)) {
    targets.push({
      id: 'external-default',
      name: 'External device to server',
      path: extTestDir
    });
  }

  return targets;
}

// Multer Storage Configuration dynamically routing based on headers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetId = req.headers['x-storage-target-id'] || 'local';
    const targets = getStorageTargets();
    const target = targets.find(t => t.id === targetId);
    
    let dest = uploadDir;
    if (target) {
      dest = target.path;
      try {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
      } catch (err) {
        console.error(`Failed to create dynamic storage target path ${dest}, falling back to local:`, err);
        dest = uploadDir;
      }
    }
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Local JWT Authentication Middleware
const requireAuth = () => {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired authentication token' });
      }
      req.auth = { userId: decoded.id }; // matches req.auth.userId in previous Clerk controller logic
      req.user = decoded;
      next();
    });
  };
};

// Admin helper function
async function checkAdmin(userId) {
  try {
    const dbResult = await query('SELECT is_admin FROM users WHERE id = $1', [userId]);
    return dbResult.rows.length > 0 && dbResult.rows[0].is_admin;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Health Check Route
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    database: 'unknown',
    storage: 'unknown'
  };

  try {
    const dbCheck = await query('SELECT 1');
    if (dbCheck && dbCheck.rows.length > 0) {
      health.database = 'connected';
    } else {
      health.database = 'disconnected';
      health.status = 'degraded';
    }
  } catch (error) {
    console.error('Health check DB connection error:', error);
    health.database = `error: ${error.message}`;
    health.status = 'degraded';
  }

  try {
    const tempFile = path.join(uploadDir, `.healthcheck-${Date.now()}`);
    fs.writeFileSync(tempFile, 'healthcheck');
    fs.unlinkSync(tempFile);
    health.storage = 'writable';
  } catch (error) {
    console.error('Health check Storage check error:', error);
    health.storage = `error: ${error.message}`;
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 500;
  res.status(statusCode).json(health);
});

// Authentication Endpoints

// 1. Auth Status (check if initial setup/admin user needs to be created)
app.get('/api/auth/status', async (req, res) => {
  try {
    const dbResult = await query('SELECT COUNT(*) FROM users');
    const totalUsers = parseInt(dbResult.rows[0].count);
    res.json({ requiresSetup: totalUsers === 0 });
  } catch (error) {
    console.error('Database connection error in auth status check:', error);
    res.status(500).json({ error: 'Database check failed' });
  }
});

// 2. Setup initial admin user (closed once database has users)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const userCountResult = await query('SELECT COUNT(*) FROM users');
    const totalUsers = parseInt(userCountResult.rows[0].count);

    if (totalUsers > 0) {
      return res.status(403).json({ error: 'Registration is closed. Please contact an administrator to register.' });
    }

    // First user is automatically flagged as admin
    const isUserAdmin = true;
    const passwordHash = await bcrypt.hash(password, 10);

    const dbResult = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_admin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, first_name AS "firstName", last_name AS "lastName", is_admin AS "isAdmin"`,
      [email, passwordHash, firstName, lastName, isUserAdmin]
    );

    const user = dbResult.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user
    });
  } catch (error) {
    console.error('Registration setup error:', error);
    res.status(500).json({ error: 'Failed to create admin account' });
  }
});

// 3. Authenticate Login and return JWT
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const dbResult = await query(
      `SELECT id, email, password_hash, first_name AS "firstName", last_name AS "lastName", is_admin AS "isAdmin" 
       FROM users WHERE email = $1`,
      [email]
    );

    if (dbResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = dbResult.rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'An error occurred during authentication' });
  }
});

// 4. Fetch dynamic storage targets securely
app.get('/api/storage-targets', requireAuth(), async (req, res) => {
  try {
    const targets = getStorageTargets();
    res.json(targets.map(t => ({ id: t.id, name: t.name, path: t.path })));
  } catch (error) {
    console.error('Error listing storage targets:', error);
    res.status(500).json({ error: 'Failed to retrieve storage targets' });
  }
});

// Authenticated Route Handlers

// Get current user profile
app.get('/api/me', requireAuth(), async (req, res) => {
  try {
    const dbResult = await query(
      'SELECT id, email, first_name AS "firstName", last_name AS "lastName", is_admin AS "isAdmin" FROM users WHERE id = $1',
      [req.auth.userId]
    );

    if (dbResult.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const dbUser = dbResult.rows[0];
    
    res.json({
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      imageUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent((dbUser.firstName || '') + ' ' + (dbUser.lastName || ''))}`,
      isAdmin: dbUser.isAdmin
    });
  } catch (error) {
    console.error('Error loading profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profiles' });
  }
});

// Upload file
app.post('/api/files/upload', requireAuth(), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const { filename, originalname, mimetype, size, path: filepath } = req.file;
    const originalName = req.body.relativePath || originalname;
    const userId = req.auth.userId;

    const dbResult = await query(
      `INSERT INTO files (user_id, filename, original_name, mime_type, size, filepath)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, original_name, mime_type, size, created_at`,
      [userId, filename, originalName, mimetype, size, filepath]
    );

    res.status(201).json(dbResult.rows[0]);
  } catch (error) {
    console.error('Database insertion error:', error);
    // Cleanup physical file on upload failure
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Database failed to store file metadata' });
  }
});

// List files for authenticated user
app.get('/api/files', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const dbResult = await query(
      `SELECT id, original_name, mime_type, size, created_at 
       FROM files 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(dbResult.rows);
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// Download / View file
app.get('/api/files/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.auth.userId;

    const dbResult = await query(
      'SELECT * FROM files WHERE id = $1',
      [id]
    );

    if (dbResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = dbResult.rows[0];

    const isAdmin = await checkAdmin(userId);
    if (file.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(file.filepath)) {
      return res.status(404).json({ error: 'File does not exist on disk' });
    }

    res.setHeader('Content-Type', file.mime_type);

    if (req.query.download === 'true') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(file.original_name)}"`
      );
    } else {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(file.original_name)}"`
      );
    }

    const fileStream = fs.createReadStream(file.filepath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error fetching file:', error);
    res.status(500).json({ error: 'Server error retrieving file' });
  }
});

// Delete file
app.delete('/api/files/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.auth.userId;

    const dbResult = await query(
      'SELECT * FROM files WHERE id = $1',
      [id]
    );

    if (dbResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = dbResult.rows[0];

    const isAdmin = await checkAdmin(userId);
    if (file.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete file from disk
    if (fs.existsSync(file.filepath)) {
      fs.unlinkSync(file.filepath);
    }

    // Delete metadata from DB
    await query('DELETE FROM files WHERE id = $1', [id]);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Admin Route: Create a new user locally in PostgreSQL database
app.post('/api/users', requireAuth(), async (req, res) => {
  try {
    const isAdmin = await checkAdmin(req.auth.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    const { email, password, firstName, lastName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user already exists
    const userCheck = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    const isUserAdmin = adminEmails.includes(email.toLowerCase());

    const passwordHash = await bcrypt.hash(password, 10);
    const dbResult = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_admin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, first_name AS "firstName", last_name AS "lastName"`,
      [email, passwordHash, firstName, lastName, isUserAdmin]
    );

    const newUser = dbResult.rows[0];

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName
      }
    });
  } catch (error) {
    console.error('Error creating user locally:', error);
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

// Admin Route: List users from local PostgreSQL database
app.get('/api/users', requireAuth(), async (req, res) => {
  try {
    const isAdmin = await checkAdmin(req.auth.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    const dbResult = await query(
      `SELECT 
          u.id, 
          u.email, 
          u.first_name AS "firstName", 
          u.last_name AS "lastName", 
          u.is_admin AS "isAdmin", 
          u.created_at AS "createdAt",
          COALESCE(SUM(f.size), 0) AS "storageUsed"
       FROM users u
       LEFT JOIN files f ON f.user_id = u.id::text
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );

    const formattedUsers = dbResult.rows.map(u => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      imageUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent((u.firstName || '') + ' ' + (u.lastName || ''))}`,
      createdAt: u.createdAt,
      storageUsed: parseInt(u.storageUsed)
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error('Error listing local users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Admin Route: Get storage analytics for all files
app.get('/api/admin/files', requireAuth(), async (req, res) => {
  try {
    const isAdmin = await checkAdmin(req.auth.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    const dbResult = await query(
      `SELECT id, user_id AS "clerk_user_id", original_name, mime_type, size, created_at 
       FROM files 
       ORDER BY created_at DESC`
    );
    res.json(dbResult.rows);
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Global server error:', err.stack);
  res.status(500).json({ error: 'An unexpected error occurred on the server' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
