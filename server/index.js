import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import morgan from 'morgan';
import { clerkMiddleware, requireAuth, clerkClient } from '@clerk/express';
import { query } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5050;

// Set up logger
app.use(morgan('dev'));

// Configure CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply Clerk middleware globally
app.use(clerkMiddleware());

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Admin helper function
async function checkAdmin(userId) {
  try {
    const user = await clerkClient.users.getUser(userId);
    const email = user.emailAddresses[0]?.emailAddress;
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    return adminEmails.includes(email?.toLowerCase());
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// API Routes

// 1. Get authenticated user details & admin status
app.get('/api/me', requireAuth(), async (req, res) => {
  try {
    const user = await clerkClient.users.getUser(req.auth.userId);
    const email = user.emailAddresses[0]?.emailAddress;
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    const isAdmin = adminEmails.includes(email?.toLowerCase());
    
    res.json({
      id: user.id,
      email,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
      isAdmin
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user profiles' });
  }
});

// 2. Upload file
app.post('/api/files/upload', requireAuth(), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const { filename, originalname, mimetype, size, path: filepath } = req.file;
    const originalName = req.body.relativePath || originalname;
    const userId = req.auth.userId;

    const dbResult = await query(
      `INSERT INTO files (clerk_user_id, filename, original_name, mime_type, size, filepath)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, original_name, mime_type, size, created_at`,
      [userId, filename, originalName, mimetype, size, filepath]
    );

    res.status(201).json(dbResult.rows[0]);
  } catch (error) {
    console.error('Database insertion error:', error);
    // Remove the uploaded file from disk if database insert failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Database failed to store file metadata' });
  }
});

// 3. List files for authenticated user
app.get('/api/files', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const dbResult = await query(
      `SELECT id, original_name, mime_type, size, created_at 
       FROM files 
       WHERE clerk_user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(dbResult.rows);
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// 4. Download / View file
app.get('/api/files/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.auth.userId;

    // Retrieve file metadata from DB
    const dbResult = await query(
      'SELECT * FROM files WHERE id = $1',
      [id]
    );

    if (dbResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = dbResult.rows[0];

    // Security check: Only allow file owner or an admin to access the file
    const isAdmin = await checkAdmin(userId);
    if (file.clerk_user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(file.filepath)) {
      return res.status(404).json({ error: 'File does not exist on disk' });
    }

    // Set content type header
    res.setHeader('Content-Type', file.mime_type);

    // If query contains download=true, force download dialog in browser
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

    // Stream file contents
    const fileStream = fs.createReadStream(file.filepath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error fetching file:', error);
    res.status(500).json({ error: 'Server error retrieving file' });
  }
});

// 5. Delete file
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

    // Security check: Only owner or admin can delete
    const isAdmin = await checkAdmin(userId);
    if (file.clerk_user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete file from disk
    if (fs.existsSync(file.filepath)) {
      fs.unlinkSync(file.filepath);
    }

    // Delete record from Database
    await query('DELETE FROM files WHERE id = $1', [id]);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Admin Route: Create a new user in Clerk
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

    const newUser = await clerkClient.users.createUser({
      emailAddress: [email],
      password,
      firstName,
      lastName
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        email: newUser.emailAddresses[0]?.emailAddress,
        firstName: newUser.firstName,
        lastName: newUser.lastName
      }
    });
  } catch (error) {
    console.error('Error creating user in Clerk:', error);
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

// Admin Route: List users from Clerk
app.get('/api/users', requireAuth(), async (req, res) => {
  try {
    const isAdmin = await checkAdmin(req.auth.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    const usersList = await clerkClient.users.getUserList();
    const formattedUsers = usersList.data.map(u => ({
      id: u.id,
      email: u.emailAddresses[0]?.emailAddress,
      firstName: u.firstName,
      lastName: u.lastName,
      imageUrl: u.imageUrl,
      createdAt: u.createdAt
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error('Error listing Clerk users:', error);
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
      `SELECT id, clerk_user_id, original_name, mime_type, size, created_at 
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
