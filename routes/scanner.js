const express = require('express');
const router = express.Router();
const scanner = require('../modules/scanner');
const db = require('../modules/database');

// GET scanner form
router.get('/', (req, res) => {
  res.render('scanner/index', { 
    title: 'SSL Certificate Scanner',
    error: null,
    formData: {
      hosts: '',
      ports: '443,8443'
    }
  });
});

// POST start scan
router.post('/', async (req, res) => {
  try {
    // Get and validate hosts
    const hostsInput = req.body.hosts || '';
    const hosts = hostsInput
      .split(/[,;\n]/)
      .map(h => h.trim())
      .filter(h => h.length > 0);
    
    // Get and validate ports
    const portsInput = req.body.ports || '443';
    const ports = portsInput
      .split(/[,;\s]/)
      .map(p => parseInt(p.trim(), 10))
      .filter(p => !isNaN(p) && p > 0 && p < 65536);
    
    if (hosts.length === 0) {
      return res.render('scanner/index', {
        title: 'SSL Certificate Scanner',
        error: 'Please provide at least one valid host',
        formData: req.body
      });
    }
    
    if (ports.length === 0) {
      return res.render('scanner/index', {
        title: 'SSL Certificate Scanner',
        error: 'Please provide at least one valid port',
        formData: req.body
      });
    }
    
    // Start scanning (async)
    const results = await scanner.scanHosts(hosts, ports);
    
    // Save results to database
    for (const cert of results) {
      await db.saveCertificate(cert);
    }
    
    // Show results page
    res.render('scanner/results', {
      title: 'Scan Results',
      results,
      scanSummary: {
        hosts: hosts.length,
        ports: ports.length,
        total: results.length,
        valid: results.filter(r => r.status === 'valid').length,
        warning: results.filter(r => r.status === 'warning').length,
        expired: results.filter(r => r.status === 'expired').length,
        error: results.filter(r => r.status === 'error').length
      }
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.render('scanner/index', {
      title: 'SSL Certificate Scanner',
      error: `Error performing scan: ${err.message}`,
      formData: req.body
    });
  }
});

// GET single host quick scan
router.get('/quick', (req, res) => {
  res.render('scanner/quick', {
    title: 'Quick Scan',
    error: null,
    formData: {
      host: '',
      port: '443'
    }
  });
});

// POST single host quick scan
router.post('/quick', async (req, res) => {
  try {
    const host = req.body.host?.trim();
    const port = parseInt(req.body.port?.trim(), 10);
    
    if (!host) {
      return res.render('scanner/quick', {
        title: 'Quick Scan',
        error: 'Please provide a valid host',
        formData: req.body
      });
    }
    
    if (isNaN(port) || port <= 0 || port >= 65536) {
      return res.render('scanner/quick', {
        title: 'Quick Scan',
        error: 'Please provide a valid port (1-65535)',
        formData: req.body
      });
    }
    
    // Perform quick scan
    const results = await scanner.scanHost(host, [port]);
    
    // Save results to database
    for (const cert of results) {
      await db.saveCertificate(cert);
    }
    
    // Redirect to certificate details if successful
    if (results.length > 0 && results[0].status !== 'error') {
      // Get certificate ID from database (since scanHost doesn't return the ID)
      const certs = await db.getAllCertificates();
      const cert = certs.find(c => c.host === host && c.port === port);
      
      if (cert) {
        return res.redirect(`/certificates/${cert.id}`);
      }
    }
    
    // Show results page if couldn't find the certificate or there was an error
    res.render('scanner/results', {
      title: 'Quick Scan Results',
      results,
      scanSummary: {
        hosts: 1,
        ports: 1,
        total: results.length,
        valid: results.filter(r => r.status === 'valid').length,
        warning: results.filter(r => r.status === 'warning').length,
        expired: results.filter(r => r.status === 'expired').length,
        error: results.filter(r => r.status === 'error').length
      }
    });
  } catch (err) {
    console.error('Quick scan error:', err);
    res.render('scanner/quick', {
      title: 'Quick Scan',
      error: `Error performing scan: ${err.message}`,
      formData: req.body
    });
  }
});

module.exports = router;
