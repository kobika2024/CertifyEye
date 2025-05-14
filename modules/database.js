const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database connection
let db;

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(path.join(dataDir, 'certify-eye.db'), (err) => {
      if (err) {
        console.error('Database initialization error:', err.message);
        reject(err);
        return;
      }
      
      // Create certificates table if it doesn't exist
      db.run(`
        CREATE TABLE IF NOT EXISTS certificates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          host TEXT NOT NULL,
          port INTEGER NOT NULL,
          subject TEXT,
          issuer TEXT,
          valid_from TEXT,
          valid_to TEXT,
          fingerprint TEXT,
          signature_algorithm TEXT,
          self_signed BOOLEAN,
          status TEXT,
          last_scanned TEXT,
          days_remaining INTEGER,
          UNIQUE(host, port)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating certificates table:', err.message);
          reject(err);
          return;
        }
        
        // Create scheduled_scans table if it doesn't exist
        db.run(`
          CREATE TABLE IF NOT EXISTS scheduled_scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            hosts TEXT NOT NULL,
            ports TEXT NOT NULL,
            frequency TEXT NOT NULL,
            last_run TEXT,
            next_run TEXT,
            active BOOLEAN DEFAULT 1
          )
        `, (err) => {
          if (err) {
            console.error('Error creating scheduled_scans table:', err.message);
            reject(err);
            return;
          }
          
          console.log('Database initialized successfully');
          resolve(true);
        });
      });
    });
  });
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
          reject(err);
          return;
        }
        console.log('Database connection closed');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// Certificate operations
function saveCertificate(certData) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT OR REPLACE INTO certificates 
      (host, port, subject, issuer, valid_from, valid_to, fingerprint, 
       signature_algorithm, self_signed, status, last_scanned, days_remaining)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(query, [
      certData.host,
      certData.port,
      certData.subject,
      certData.issuer,
      certData.validFrom,
      certData.validTo,
      certData.fingerprint,
      certData.signatureAlgorithm,
      certData.selfSigned ? 1 : 0,
      certData.status,
      certData.lastScanned,
      certData.daysRemaining
    ], function(err) {
      if (err) {
        console.error('Error saving certificate:', err.message);
        reject(err);
        return;
      }
      resolve(this.lastID);
    });
  });
}

function getAllCertificates() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM certificates ORDER BY days_remaining ASC', [], (err, rows) => {
      if (err) {
        console.error('Error fetching certificates:', err.message);
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

function getCertificateById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM certificates WHERE id = ?', [id], (err, row) => {
      if (err) {
        console.error('Error fetching certificate:', err.message);
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function deleteCertificate(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM certificates WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('Error deleting certificate:', err.message);
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
}

// Scheduled scan operations
function saveScheduledScan(scanData) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT OR REPLACE INTO scheduled_scans 
      (id, name, hosts, ports, frequency, last_run, next_run, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(query, [
      scanData.id || null,
      scanData.name,
      JSON.stringify(scanData.hosts),
      JSON.stringify(scanData.ports),
      scanData.frequency,
      scanData.lastRun || null,
      scanData.nextRun || null,
      scanData.active ? 1 : 0
    ], function(err) {
      if (err) {
        console.error('Error saving scheduled scan:', err.message);
        reject(err);
        return;
      }
      resolve(this.lastID);
    });
  });
}

function getAllScheduledScans() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM scheduled_scans', [], (err, rows) => {
      if (err) {
        console.error('Error fetching scheduled scans:', err.message);
        reject(err);
        return;
      }
      
      // Parse JSON strings back to arrays
      const scans = rows.map(scan => ({
        ...scan,
        hosts: JSON.parse(scan.hosts),
        ports: JSON.parse(scan.ports),
        active: Boolean(scan.active)
      }));
      
      resolve(scans);
    });
  });
}

function getScheduledScanById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM scheduled_scans WHERE id = ?', [id], (err, row) => {
      if (err) {
        console.error('Error fetching scheduled scan:', err.message);
        reject(err);
        return;
      }
      
      if (row) {
        // Parse JSON strings back to arrays
        row.hosts = JSON.parse(row.hosts);
        row.ports = JSON.parse(row.ports);
        row.active = Boolean(row.active);
      }
      
      resolve(row);
    });
  });
}

function deleteScheduledScan(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM scheduled_scans WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('Error deleting scheduled scan:', err.message);
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
}

function updateScheduledScanTimes(id, lastRun, nextRun) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE scheduled_scans SET last_run = ?, next_run = ? WHERE id = ?', [lastRun, nextRun, id], function(err) {
      if (err) {
        console.error('Error updating scheduled scan times:', err.message);
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
}

module.exports = {
  initializeDatabase,
  closeDatabase,
  saveCertificate,
  getAllCertificates,
  getCertificateById,
  deleteCertificate,
  saveScheduledScan,
  getAllScheduledScans,
  getScheduledScanById,
  deleteScheduledScan,
  updateScheduledScanTimes
};
