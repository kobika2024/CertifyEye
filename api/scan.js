const express = require('express');
const router = express.Router();
const scanner = require('../modules/scanner');
const db = require('../modules/database');

// POST /api/scan - Handle scanning requests from the UI
router.post('/', async (req, res) => {
  try {
    console.log('Received scan request:', JSON.stringify(req.body, null, 2));
    const { hosts, ports, type, ipRange, fileContent } = req.body;
    
    let hostsToScan = [];
    
    // Process hosts based on scan type
    if (type === 'manual' && hosts) {
      // Handle manual host input
      console.log('Processing manual host input:', hosts);
      hostsToScan = hosts.split(/[,;\n\s]/)
        .map(h => h.trim())
        .filter(h => h.length > 0);
    } 
    else if (type === 'range' && ipRange) {
      // Handle IP range by splitting into individual IPs
      console.log('Processing IP range:', ipRange);
      // For now, we'll just add the endpoints as individual hosts
      const [start, end] = ipRange.split('-').map(ip => ip.trim());
      if (start && end) {
        // Basic single IP processing (add more robust handling in production)
        hostsToScan = [start, end];
      }
    } 
    else if (type === 'file' && fileContent) {
      // Parse hosts from file content
      console.log('Processing file content hosts');
      hostsToScan = fileContent.split(/[,;\n\s]/)
        .map(h => h.trim())
        .filter(h => h.length > 0);
    }
    
    // Simple special case handling - if single input looks like a domain, process it as-is
    if (hostsToScan.length === 0 && hosts && hosts.trim()) {
      console.log('No hosts extracted, using raw input as a single host:', hosts.trim());
      hostsToScan = [hosts.trim()];
    }
    
    // Process ports
    let portsToScan = [443]; // Default port
    if (ports) {
      if (typeof ports === 'string') {
        portsToScan = ports.split(/[,;\s]/)
          .map(p => parseInt(p.trim(), 10))
          .filter(p => !isNaN(p) && p > 0 && p < 65536);
      } else if (Array.isArray(ports)) {
        portsToScan = ports
          .map(p => parseInt(p, 10))
          .filter(p => !isNaN(p) && p > 0 && p < 65536);
      }
    }
    
    if (hostsToScan.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid hosts provided'
      });
    }
    
    console.log(`Starting scan for ${hostsToScan.length} hosts on ${portsToScan.length} ports`);
    console.log('Hosts to scan:', hostsToScan);
    console.log('Ports to scan:', portsToScan);
    
    // Start scanning
    console.log(`API: Starting actual scan with scanner.scanHosts...`);
    let results = [];
    
    try {
      results = await scanner.scanHosts(hostsToScan, portsToScan);
      console.log(`API: Scan complete, got ${results.length} results`);
      
      // Save results to database
      for (const cert of results) {
        if (cert.status !== 'error') {
          await db.saveCertificate(cert);
          console.log(`API: Saved certificate for ${cert.host}:${cert.port} to database`);
        } else {
          console.log(`API: Skipping error result for ${cert.hostname}:${cert.port}`);
        }
      }
    } catch (scanError) {
      console.error(`API: Scan failed with error:`, scanError);
      // Create an error result for tracking
      if (hostsToScan.length > 0) {
        results.push({
          hostname: hostsToScan[0],
          port: portsToScan[0],
          status: 'error',
          error: scanError.message,
          lastScanned: new Date().toISOString()
        });
      }
    }
    
    // Compile scan summary
    const scanSummary = {
      hosts: hostsToScan.length,
      ports: portsToScan.length,
      total: results.length,
      valid: results.filter(r => r.status === 'valid').length,
      warning: results.filter(r => r.status === 'warning').length,
      expired: results.filter(r => r.status === 'expired').length,
      error: results.filter(r => r.status === 'error').length,
      timestamp: new Date().toISOString()
    };
    
    // Process results for consistent format between backend and frontend
    const processedResults = results.map(cert => {
      // Create a consistent certificate object with all required fields
      return {
        id: cert.id || Math.floor(Math.random() * 1000000),  // Generate an ID if not present
        hostname: cert.host || cert.hostname || cert.commonName || 'unknown',
        port: cert.port || 443,
        issuer: cert.issuer || 'Unknown',
        subject: cert.subject || 'Unknown',
        commonName: cert.commonName || '',
        organization: cert.organization || '',
        validFrom: cert.validFrom || new Date().toISOString(),
        validTo: cert.validTo || new Date().toISOString(),
        fingerprint: cert.fingerprint || '',
        signatureAlgorithm: cert.signatureAlgorithm || 'Unknown',
        selfSigned: cert.selfSigned || false,
        daysRemaining: typeof cert.daysRemaining === 'number' ? cert.daysRemaining : 0,
        keyUsage: cert.keyUsage || '',
        status: cert.status || (cert.error ? 'error' : 'valid'),
        lastScanned: cert.lastScanned || new Date().toISOString(),
        error: cert.error || null
      };
    });
    
    console.log('Sending processed results to frontend:', JSON.stringify(processedResults.slice(0, 1), null, 2));
    
    // Return processed results
    return res.json({
      success: true,
      data: processedResults,
      summary: scanSummary
    });
  } 
  catch (err) {
    console.error('API scan error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
      message: 'Failed to perform scan'
    });
  }
});

// GET /api/scan/history - Get scan history
router.get('/history', async (req, res) => {
  try {
    // For now, return a simple list based on certificates
    const certs = await db.getAllCertificates();
    
    // Group certificates by scan date to simulate history
    const scanHistory = [];
    const dateMap = new Map();
    
    for (const cert of certs) {
      const scanDate = cert.lastScanned?.split('T')[0] || 'Unknown';
      if (!dateMap.has(scanDate)) {
        dateMap.set(scanDate, scanHistory.length);
        scanHistory.push({
          id: scanHistory.length + 1,
          date: scanDate,
          totalHosts: 0,
          validCerts: 0,
          warningCerts: 0,
          expiredCerts: 0,
          errorCerts: 0
        });
      }
      
      const index = dateMap.get(scanDate);
      scanHistory[index].totalHosts++;
      
      if (cert.status === 'valid') scanHistory[index].validCerts++;
      else if (cert.status === 'warning') scanHistory[index].warningCerts++;
      else if (cert.status === 'expired') scanHistory[index].expiredCerts++;
      else scanHistory[index].errorCerts++;
    }
    
    return res.json({
      success: true,
      data: scanHistory
    });
  } 
  catch (err) {
    console.error('API scan history error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
      message: 'Failed to retrieve scan history'
    });
  }
});

// GET /api/scan/:id/results - Get results for a specific scan
router.get('/:id/results', async (req, res) => {
  try {
    const scanId = parseInt(req.params.id, 10);
    
    if (isNaN(scanId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid scan ID'
      });
    }
    
    // For now, return all certificates as we don't have proper scan history
    const certs = await db.getAllCertificates();
    
    return res.json({
      success: true,
      data: certs
    });
  } 
  catch (err) {
    console.error('API scan results error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
      message: 'Failed to retrieve scan results'
    });
  }
});

module.exports = router;
