const express = require('express');
const path = require('path');
const methodOverride = require('method-override');
const cors = require('cors');
const db = require('./modules/database');
const scannerRoutes = require('./routes/scanner');
const certificateRoutes = require('./routes/certificates');
const schedulerRoutes = require('./routes/scheduler');
const apiRoutes = require('./api/index');

// Initialize the application
const app = express();
const PORT = process.env.PORT || 3000;

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// Configure CORS for API requests
app.use(cors({
  // Allow any localhost port for development
  origin: function(origin, callback) {
    // Allow any localhost origin or when there's no origin (like curl requests)
    if (!origin || origin.match(/^https?:\/\/localhost:[0-9]+$/) || origin.match(/^https?:\/\/127.0.0.1:[0-9]+$/)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Initialize database and start the server
db.initializeDatabase()
  .then(() => {
    // Start the server after database initialization
    app.listen(PORT, () => {
      console.log(`CertifyEye server is running on port ${PORT}`);
      console.log(`Open http://localhost:${PORT} in your browser`);

      // Initialize scheduler after database and server are ready
      const scheduler = require('./modules/scheduler');
      scheduler.initializeScheduler();
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

// Routes
app.get('/', (req, res) => {
  res.redirect('/certificates');
});

app.use('/scanner', scannerRoutes);
app.use('/certificates', certificateRoutes);
app.use('/scheduler', schedulerRoutes);

// API Routes
app.use('/api', apiRoutes);

// Server will be started after database initialization

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  try {
    await db.closeDatabase();
    console.log('Database closed successfully');
  } catch (err) {
    console.error('Error closing database:', err);
  }
  process.exit(0);
});
