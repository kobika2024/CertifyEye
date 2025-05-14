const express = require('express');
const router = express.Router();
const db = require('../modules/database');
const moment = require('moment');

// GET all certificates
router.get('/', async (req, res) => {
  try {
    const certificates = await db.getAllCertificates();
    
    // Process for view
    const processedCerts = certificates.map(cert => {
      return {
        ...cert,
        self_signed: cert.self_signed ? 'Yes' : 'No',
        valid_from: moment(cert.valid_from).format('YYYY-MM-DD'),
        valid_to: moment(cert.valid_to).format('YYYY-MM-DD'),
        last_scanned: moment(cert.last_scanned).format('YYYY-MM-DD HH:mm'),
        statusClass: cert.status === 'valid' ? 'success' : 
                    cert.status === 'warning' ? 'warning' : 
                    cert.status === 'expired' ? 'danger' : 'secondary'
      };
    });
    
    // Count certificates by status
    const stats = {
      total: certificates.length,
      valid: certificates.filter(c => c.status === 'valid').length,
      warning: certificates.filter(c => c.status === 'warning').length,
      expired: certificates.filter(c => c.status === 'expired').length,
      error: certificates.filter(c => c.status === 'error').length
    };
    
    res.render('certificates/index', { 
      certificates: processedCerts,
      stats: stats,
      title: 'SSL Certificates'
    });
  } catch (err) {
    console.error('Error getting certificates:', err);
    res.status(500).render('error', { 
      message: 'Error loading certificates',
      error: { status: 500, stack: err.message }
    });
  }
});

// GET certificate details
router.get('/:id', async (req, res) => {
  try {
    const certificate = await db.getCertificateById(req.params.id);
    
    if (!certificate) {
      return res.status(404).render('error', { 
        message: 'Certificate not found',
        error: { status: 404, stack: '' }
      });
    }
    
    // Process for view
    certificate.self_signed = certificate.self_signed ? 'Yes' : 'No';
    certificate.valid_from = moment(certificate.valid_from).format('YYYY-MM-DD HH:mm:ss');
    certificate.valid_to = moment(certificate.valid_to).format('YYYY-MM-DD HH:mm:ss');
    certificate.last_scanned = moment(certificate.last_scanned).format('YYYY-MM-DD HH:mm:ss');
    certificate.statusClass = certificate.status === 'valid' ? 'success' : 
                             certificate.status === 'warning' ? 'warning' : 
                             certificate.status === 'expired' ? 'danger' : 'secondary';
    
    res.render('certificates/details', { 
      certificate,
      title: `Certificate: ${certificate.host}:${certificate.port}`
    });
  } catch (err) {
    console.error('Error getting certificate details:', err);
    res.status(500).render('error', { 
      message: 'Error loading certificate details',
      error: { status: 500, stack: err.message }
    });
  }
});

// DELETE certificate
router.delete('/:id', async (req, res) => {
  try {
    const success = await db.deleteCertificate(req.params.id);
    
    if (success) {
      res.redirect('/certificates');
    } else {
      res.status(404).render('error', { 
        message: 'Certificate not found or could not be deleted',
        error: { status: 404, stack: '' }
      });
    }
  } catch (err) {
    console.error('Error deleting certificate:', err);
    res.status(500).render('error', { 
      message: 'Error deleting certificate',
      error: { status: 500, stack: err.message }
    });
  }
});

module.exports = router;
