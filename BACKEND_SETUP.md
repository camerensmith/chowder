# Backend Setup Guide for Chowder

This guide explains how to set up a backend server to support Chowder's online features, including email notifications, authentication, and data synchronization.

## Overview

Chowder is designed to work **offline-first**. All core features work without a backend:
- ✅ Sign up (local account creation)
- ✅ Data storage (SQLite/IndexedDB)
- ✅ Session management (localStorage/AsyncStorage)
- ✅ Offline functionality (service worker)

A backend server is **optional** but enables:
- 📧 Welcome email notifications
- 🔐 Cloud-based authentication
- ☁️ Data synchronization across devices
- 🔄 Account recovery

## Backend Requirements

### Required Endpoints

#### 1. Authentication Endpoints

**POST /api/auth/signup**
```json
Request:
{
  "email": "user@example.com",
  "password": "securepassword",
  "displayName": "John Doe"
}

Response (200 OK):
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "displayName": "John Doe",
    "avatarUri": null
  }
}
```

**POST /api/auth/login**
```json
Request:
{
  "email": "user@example.com",
  "password": "securepassword"
}

Response (200 OK):
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "displayName": "John Doe",
    "avatarUri": null
  }
}
```

**GET /api/user/profile**
```
Headers:
  Authorization: Bearer {jwt_token}

Response (200 OK):
{
  "id": "user_id",
  "email": "user@example.com",
  "displayName": "John Doe",
  "avatarUri": null
}
```

#### 2. Email Endpoint

**POST /api/email/welcome**
```json
Request:
{
  "email": "user@example.com",
  "displayName": "John Doe"
}

Response (200 OK):
{
  "success": true,
  "message": "Welcome email sent successfully"
}
```

**Important Notes:**
- This endpoint is called asynchronously after user signup
- If it fails, the signup process still succeeds (graceful degradation)
- Frontend displays a confirmation message when email is sent successfully

#### 3. Health Check Endpoint

**GET /api/health**
```json
Response (200 OK):
{
  "status": "healthy",
  "timestamp": 1234567890
}
```

## Email Service Integration

### Option 1: SendGrid

```javascript
// Example using SendGrid
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.post('/api/email/welcome', async (req, res) => {
  const { email, displayName } = req.body;
  
  const msg = {
    to: email,
    from: 'noreply@yourapp.com', // Must be verified with SendGrid
    subject: 'Welcome to Chowder!',
    text: `Hi ${displayName},\n\nWelcome to Chowder! Your account has been created successfully.\n\nEnjoy tracking your favorite restaurants and dishes!\n\nBest regards,\nThe Chowder Team`,
    html: `<p>Hi ${displayName},</p><p>Welcome to Chowder! Your account has been created successfully.</p><p>Enjoy tracking your favorite restaurants and dishes!</p><p>Best regards,<br/>The Chowder Team</p>`,
  };
  
  try {
    await sgMail.send(msg);
    res.json({ success: true, message: 'Welcome email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});
```

### Option 2: AWS SES

```javascript
// Example using AWS SES
const AWS = require('aws-sdk');
const ses = new AWS.SES({ region: 'us-east-1' });

app.post('/api/email/welcome', async (req, res) => {
  const { email, displayName } = req.body;
  
  const params = {
    Source: 'noreply@yourapp.com',
    Destination: {
      ToAddresses: [email]
    },
    Message: {
      Subject: {
        Data: 'Welcome to Chowder!'
      },
      Body: {
        Text: {
          Data: `Hi ${displayName},\n\nWelcome to Chowder! Your account has been created successfully.\n\nEnjoy tracking your favorite restaurants and dishes!\n\nBest regards,\nThe Chowder Team`
        },
        Html: {
          Data: `<p>Hi ${displayName},</p><p>Welcome to Chowder! Your account has been created successfully.</p><p>Enjoy tracking your favorite restaurants and dishes!</p><p>Best regards,<br/>The Chowder Team</p>`
        }
      }
    }
  };
  
  try {
    await ses.sendEmail(params).promise();
    res.json({ success: true, message: 'Welcome email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});
```

### Option 3: Nodemailer (SMTP)

```javascript
// Example using Nodemailer
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

app.post('/api/email/welcome', async (req, res) => {
  const { email, displayName } = req.body;
  
  const mailOptions = {
    from: 'noreply@yourapp.com',
    to: email,
    subject: 'Welcome to Chowder!',
    text: `Hi ${displayName},\n\nWelcome to Chowder! Your account has been created successfully.\n\nEnjoy tracking your favorite restaurants and dishes!\n\nBest regards,\nThe Chowder Team`,
    html: `<p>Hi ${displayName},</p><p>Welcome to Chowder! Your account has been created successfully.</p><p>Enjoy tracking your favorite restaurants and dishes!</p><p>Best regards,<br/>The Chowder Team</p>`
  };
  
  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Welcome email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});
```

## Environment Configuration

### Frontend Configuration

Create a `.env` file in the frontend root directory:

```bash
# Backend API URL (required for online features)
EXPO_PUBLIC_API_URL=https://your-api-url.com

# If not set, app runs in offline-only mode
```

### Backend Configuration

Example `.env` file for backend:

```bash
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/chowder

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=7d

# Email Service (choose one)
# SendGrid
SENDGRID_API_KEY=your-sendgrid-api-key

# AWS SES
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1

# SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password

# App Config
FROM_EMAIL=noreply@yourapp.com
```

## Testing

### Test Backend Availability

```bash
curl https://your-api-url.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": 1234567890
}
```

### Test Email Endpoint

```bash
curl -X POST https://your-api-url.com/api/email/welcome \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "displayName": "Test User"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Welcome email sent successfully"
}
```

### Test Signup with Email

1. Configure `EXPO_PUBLIC_API_URL` in frontend `.env`
2. Start the app: `npm start`
3. Create a new account
4. Check for welcome email
5. Verify success message in app: "A welcome email has been sent to [email]"

## Troubleshooting

### Email not sending

1. **Check backend logs** for email service errors
2. **Verify email service credentials** in backend `.env`
3. **Check spam folder** - welcome emails might be filtered
4. **Verify sender email** is configured with your email service
5. **Test email endpoint** directly with curl

### Backend not connecting

1. **Verify `EXPO_PUBLIC_API_URL`** is set correctly
2. **Check CORS settings** on backend allow frontend domain
3. **Test health endpoint**: `curl https://your-api-url.com/api/health`
4. **Check network connectivity** and firewall rules

### App working offline

This is expected! Chowder is designed to work offline-first:
- Users can still sign up (locally)
- All data is stored locally
- No email will be sent
- App will sync when backend becomes available

## Minimal Backend Example

Here's a minimal Express.js backend to get started:

```javascript
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sgMail = require('@sendgrid/mail');

const app = express();
app.use(express.json());

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// In-memory user store (use a real database in production!)
const users = new Map();

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: Date.now() });
});

// Signup
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, displayName } = req.body;
  
  if (users.has(email)) {
    return res.status(400).json({ error: 'User already exists' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    id: Date.now().toString(),
    email,
    displayName,
    password: hashedPassword
  };
  
  users.set(email, user);
  
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName
    }
  });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  const user = users.get(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName
    }
  });
});

// Welcome email
app.post('/api/email/welcome', async (req, res) => {
  const { email, displayName } = req.body;
  
  const msg = {
    to: email,
    from: process.env.FROM_EMAIL,
    subject: 'Welcome to Chowder!',
    text: `Hi ${displayName},\n\nWelcome to Chowder!`,
    html: `<p>Hi ${displayName},</p><p>Welcome to Chowder!</p>`
  };
  
  try {
    await sgMail.send(msg);
    res.json({ success: true, message: 'Welcome email sent' });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

## Security Best Practices

1. **Use HTTPS** in production
2. **Validate email addresses** before sending
3. **Rate limit** email endpoint to prevent abuse
4. **Store passwords** securely with bcrypt/argon2
5. **Use JWT** with reasonable expiry times
6. **Implement CORS** properly for web clients
7. **Log email failures** for monitoring
8. **Verify sender domain** with email service

## Next Steps

1. Deploy backend to a hosting service (Heroku, AWS, DigitalOcean, etc.)
2. Set up email service account (SendGrid, AWS SES, etc.)
3. Configure environment variables
4. Set `EXPO_PUBLIC_API_URL` in frontend
5. Test signup flow with email notifications

## Support

For issues or questions:
- Check backend logs for errors
- Verify all environment variables are set
- Test endpoints individually with curl
- Remember: App works offline without backend!
