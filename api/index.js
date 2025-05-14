const express = require('express');
const router = express.Router();

// Import API route modules
const scanRoutes = require('./scan');
const certificateRoutes = require('./certificates');

// API middleware for CORS and content type
router.use((req, res, next) => {
  // Allow cross-origin requests from the UI application
  res.header('Access-Control-Allow-Origin', 'http://localhost:3001');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Set Content-Type for all API responses
  res.header('Content-Type', 'application/json');
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Register API routes
router.use('/scan', scanRoutes);
router.use('/certificates', certificateRoutes);

// Basic health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// Root API endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to CertifyEye API',
    endpoints: {
      '/api/scan': 'Scan hosts for SSL certificates',
      '/api/certificates': 'Manage certificate data',
      '/api/health': 'API health check'
    }
  });
});

module.exports = router;
