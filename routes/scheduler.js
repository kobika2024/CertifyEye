const express = require('express');
const router = express.Router();
const scheduler = require('../modules/scheduler');
const db = require('../modules/database');
const moment = require('moment');

// GET scheduler dashboard
router.get('/', async (req, res) => {
  try {
    const scheduledScans = await db.getAllScheduledScans();
    
    // Format for view
    const formattedScans = scheduledScans.map(scan => ({
      ...scan,
      last_run: scan.last_run ? moment(scan.last_run).format('YYYY-MM-DD HH:mm') : 'Never',
      next_run: scan.next_run ? moment(scan.next_run).format('YYYY-MM-DD HH:mm') : 'Not scheduled',
      hosts_count: scan.hosts.length,
      ports_count: scan.ports.length,
      frequency_display: getFrequencyDisplay(scan.frequency)
    }));
    
    res.render('scheduler/index', {
      title: 'Scheduled Scans',
      scheduledScans: formattedScans
    });
  } catch (err) {
    console.error('Error getting scheduled scans:', err);
    res.status(500).render('error', { 
      message: 'Error loading scheduled scans',
      error: { status: 500, stack: err.message }
    });
  }
});

// GET form to create new scheduled scan
router.get('/new', (req, res) => {
  res.render('scheduler/form', {
    title: 'Create Scheduled Scan',
    scan: {
      id: null,
      name: '',
      hosts: [],
      ports: [443, 8443],
      frequency: 'daily',
      active: true
    },
    isNew: true
  });
});

// POST create new scheduled scan
router.post('/', async (req, res) => {
  try {
    // Process form data
    const hosts = req.body.hosts
      .split(/[,;\n]/)
      .map(h => h.trim())
      .filter(h => h.length > 0);
    
    const ports = req.body.ports
      .split(/[,;\s]/)
      .map(p => parseInt(p.trim(), 10))
      .filter(p => !isNaN(p) && p > 0 && p < 65536);
    
    // Validate
    if (hosts.length === 0) {
      return res.status(400).render('scheduler/form', {
        title: 'Create Scheduled Scan',
        error: 'Please provide at least one valid host',
        scan: { ...req.body, hosts: [], ports: [] },
        isNew: true
      });
    }
    
    if (ports.length === 0) {
      return res.status(400).render('scheduler/form', {
        title: 'Create Scheduled Scan',
        error: 'Please provide at least one valid port',
        scan: { ...req.body, hosts: [], ports: [] },
        isNew: true
      });
    }
    
    // Create scan object
    const scan = {
      name: req.body.name,
      hosts: hosts,
      ports: ports,
      frequency: req.body.frequency,
      active: req.body.active === 'on' || req.body.active === true
    };
    
    // Save to database
    const scanId = await db.saveScheduledScan(scan);
    
    // Schedule the job if active
    if (scan.active && scanId) {
      const savedScan = await db.getScheduledScanById(scanId);
      scheduler.scheduleJob(savedScan);
    }
    
    res.redirect('/scheduler');
  } catch (err) {
    console.error('Error creating scheduled scan:', err);
    res.status(500).render('scheduler/form', {
      title: 'Create Scheduled Scan',
      error: `Error creating scheduled scan: ${err.message}`,
      scan: { ...req.body, hosts: [], ports: [] },
      isNew: true
    });
  }
});

// GET edit scheduled scan form
router.get('/:id/edit', async (req, res) => {
  try {
    const scan = await db.getScheduledScanById(req.params.id);
    
    if (!scan) {
      return res.status(404).render('error', {
        message: 'Scheduled scan not found',
        error: { status: 404, stack: '' }
      });
    }
    
    // Format for view
    scan.hosts = scan.hosts.join('\n');
    scan.ports = scan.ports.join(', ');
    
    res.render('scheduler/form', {
      title: `Edit Scheduled Scan: ${scan.name}`,
      scan,
      isNew: false
    });
  } catch (err) {
    console.error('Error getting scheduled scan:', err);
    res.status(500).render('error', { 
      message: 'Error loading scheduled scan',
      error: { status: 500, stack: err.message }
    });
  }
});

// PUT update scheduled scan
router.put('/:id', async (req, res) => {
  try {
    const scanId = parseInt(req.params.id, 10);
    
    // Process form data
    const hosts = req.body.hosts
      .split(/[,;\n]/)
      .map(h => h.trim())
      .filter(h => h.length > 0);
    
    const ports = req.body.ports
      .split(/[,;\s]/)
      .map(p => parseInt(p.trim(), 10))
      .filter(p => !isNaN(p) && p > 0 && p < 65536);
    
    // Validate
    if (hosts.length === 0 || ports.length === 0) {
      return res.status(400).render('scheduler/form', {
        title: 'Edit Scheduled Scan',
        error: 'Please provide valid hosts and ports',
        scan: { ...req.body, id: scanId, hosts: [], ports: [] },
        isNew: false
      });
    }
    
    // Get existing scan to preserve last_run and next_run
    const existingScan = await db.getScheduledScanById(scanId);
    
    if (!existingScan) {
      return res.status(404).render('error', {
        message: 'Scheduled scan not found',
        error: { status: 404, stack: '' }
      });
    }
    
    // Create updated scan object
    const scan = {
      id: scanId,
      name: req.body.name,
      hosts: hosts,
      ports: ports,
      frequency: req.body.frequency,
      active: req.body.active === 'on' || req.body.active === true,
      lastRun: existingScan.last_run,
      nextRun: existingScan.next_run
    };
    
    // Save to database
    await db.saveScheduledScan(scan);
    
    // Update schedule
    scheduler.scheduleJob(scan);
    
    res.redirect('/scheduler');
  } catch (err) {
    console.error('Error updating scheduled scan:', err);
    res.status(500).render('scheduler/form', {
      title: 'Edit Scheduled Scan',
      error: `Error updating scheduled scan: ${err.message}`,
      scan: { ...req.body, id: req.params.id, hosts: [], ports: [] },
      isNew: false
    });
  }
});

// DELETE scheduled scan
router.delete('/:id', async (req, res) => {
  try {
    const scanId = parseInt(req.params.id, 10);
    
    // Cancel any active job
    if (scanId) {
      const scan = { id: scanId, active: false };
      scheduler.scheduleJob(scan); // This will cancel the job
    }
    
    // Delete from database
    await db.deleteScheduledScan(scanId);
    
    res.redirect('/scheduler');
  } catch (err) {
    console.error('Error deleting scheduled scan:', err);
    res.status(500).render('error', {
      message: 'Error deleting scheduled scan',
      error: { status: 500, stack: err.message }
    });
  }
});

// POST run scan now
router.post('/:id/run', async (req, res) => {
  try {
    const scanId = parseInt(req.params.id, 10);
    
    // Run the scan
    await scheduler.runScanNow(scanId);
    
    res.redirect('/scheduler');
  } catch (err) {
    console.error('Error running scheduled scan:', err);
    res.status(500).render('error', {
      message: 'Error running scheduled scan',
      error: { status: 500, stack: err.message }
    });
  }
});

// Helper function to display frequency in human-readable format
function getFrequencyDisplay(frequency) {
  switch (frequency) {
    case 'hourly': return 'Every hour';
    case 'daily': return 'Every day';
    case 'weekly': return 'Every week';
    case 'monthly': return 'Every month';
    default: return frequency; // Custom cron expression
  }
}

module.exports = router;
