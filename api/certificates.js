const express = require('express');
const router = express.Router();
const db = require('../modules/database');

// GET /api/certificates - Get all certificates with optional filtering
router.get('/', async (req, res) => {
  try {
    const { hostname, port, issuer, expiresIn, status, page, limit, sortBy, sortDirection } = req.query;
    
    // Get all certificates from the database
    let certs = await db.getAllCertificates();
    
    // Apply filters if provided
    if (hostname) {
      certs = certs.filter(cert => cert.host && cert.host.includes(hostname));
    }
    
    if (port) {
      const portNum = parseInt(port, 10);
      certs = certs.filter(cert => cert.port === portNum);
    }
    
    if (issuer) {
      certs = certs.filter(cert => cert.issuer && cert.issuer.includes(issuer));
    }
    
    if (expiresIn) {
      const days = parseInt(expiresIn, 10);
      certs = certs.filter(cert => cert.days_remaining <= days);
    }
    
    if (status && Array.isArray(status)) {
      certs = certs.filter(cert => status.includes(cert.status));
    } else if (status) {
      certs = certs.filter(cert => cert.status === status);
    }
    
    // Apply sorting
    if (sortBy) {
      certs.sort((a, b) => {
        if (a[sortBy] < b[sortBy]) return sortDirection === 'desc' ? 1 : -1;
        if (a[sortBy] > b[sortBy]) return sortDirection === 'desc' ? -1 : 1;
        return 0;
      });
    }
    
    // Apply pagination
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || certs.length;
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedCerts = certs.slice(startIndex, endIndex);
    
    return res.json({
      success: true,
      data: paginatedCerts,
      pagination: {
        total: certs.length,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(certs.length / limitNum)
      }
    });
  } 
  catch (err) {
    console.error('API certificates error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
      message: 'Failed to retrieve certificates'
    });
  }
});

// GET /api/certificates/:id - Get certificate by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid certificate ID'
      });
    }
    
    const cert = await db.getCertificateById(id);
    
    if (!cert) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found'
      });
    }
    
    return res.json({
      success: true,
      data: cert
    });
  } 
  catch (err) {
    console.error('API certificate by ID error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
      message: 'Failed to retrieve certificate'
    });
  }
});

// DELETE /api/certificates/:id - Delete certificate
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid certificate ID'
      });
    }
    
    await db.deleteCertificate(id);
    
    return res.json({
      success: true,
      message: 'Certificate deleted successfully'
    });
  } 
  catch (err) {
    console.error('API delete certificate error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
      message: 'Failed to delete certificate'
    });
  }
});

module.exports = router;
