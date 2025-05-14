const tls = require('tls');
const net = require('net');
const forge = require('node-forge');
const moment = require('moment');
const ipRangeCheck = require('ip-range-check');

/**
 * Scans a host for SSL certificates on specified ports
 * @param {string} host - The hostname or IP address to scan
 * @param {Array} ports - Array of ports to scan
 * @param {number} timeout - Connection timeout in milliseconds
 * @returns {Promise<Array>} - Array of certificate data objects
 */
async function scanHost(host, ports = [443], timeout = 5000) {
  const results = [];
  
  console.log(`Scanner: Scanning host ${host} on ports ${ports.join(', ')}`);
  
  // Scan each port
  for (const port of ports) {
    try {
      console.log(`Scanner: Attempting to connect to ${host}:${port}`);
      const certificate = await getCertificate(host, port, timeout);
      if (certificate) {
        console.log(`Scanner: Successfully obtained certificate from ${host}:${port}`);
        results.push(certificate);
      }
    } catch (err) {
      console.error(`Error scanning ${host}:${port} - ${err.message}`);
      // Still add the failed host to results
      results.push({
        host,
        port,
        status: 'error',
        error: err.message,
        lastScanned: new Date().toISOString()
      });
    }
  }
  
  console.log(`Scanner: Completed scan of ${host}, found ${results.length} results`);
  return results;
}

/**
 * Gets the SSL certificate from a host on a specific port
 * @param {string} host - The hostname or IP address
 * @param {number} port - The port to connect to
 * @param {number} timeout - Connection timeout in milliseconds
 * @returns {Promise<Object>} - Certificate data
 */
function getCertificate(host, port, timeout = 10000) {
  return new Promise((resolve, reject) => {
    console.log(`Getting certificate for ${host}:${port}`);
    
    try {
      // Create TLS connection with improved options
      const socket = tls.connect(
        {
          host: host,
          port: port,
          rejectUnauthorized: false, // Allow self-signed certificates
          timeout: timeout,  // Use timeout parameter
          servername: host,  // Important for SNI
          minVersion: 'TLSv1'  // Support older TLS versions if needed
        },
        () => {
          // This callback runs on successful TLS handshake
          console.log(`TLS connection established with ${host}:${port}`);
          
          try {
            // Get certificate with detailed information
            const cert = socket.getPeerCertificate(true);
            console.log(`Got certificate from ${host}:${port}. Empty? ${!cert || Object.keys(cert).length === 0}`);
            
            if (!cert || Object.keys(cert).length === 0) {
              socket.end();
              reject(new Error('No certificate found'));
              return;
            }
            
            // Save the raw certificate information
            const rawCertData = {
              host: host,
              port: port,
              status: 'valid',
              lastScanned: new Date().toISOString(),
              // Extract subject fields directly from raw certificate
              commonName: extractSubjectField(cert, 'CN'),
              organization: extractSubjectField(cert, 'O'),
              // Extract other useful fields
              issuer: formatRawIssuer(cert.issuer),
              validFrom: cert.valid_from || cert.validFrom,
              validTo: cert.valid_to || cert.validTo,
              // Calculate days remaining
              daysRemaining: calculateDaysRemaining(cert.valid_to || cert.validTo),
              fingerprint: cert.fingerprint || 'Unknown',
              serialNumber: cert.serialNumber || 'Unknown'
            };
            
            // Try to parse more detailed info with forge if raw data has cert.raw
            if (cert.raw) {
              try {
                // Parse certificate with forge for additional details
                const forgeCert = convertToPem(cert.raw);
                const parsedCert = parseCertificate(forgeCert);
                
                // Combine the raw data with the parsed data, preferring raw data for critical fields
                const combinedData = {
                  ...parsedCert,
                  ...rawCertData,
                  // Keep these specific fields from raw data to ensure accuracy
                  host: host,
                  port: port,
                  commonName: rawCertData.commonName || parsedCert.commonName,
                  organization: rawCertData.organization || parsedCert.organization,
                  issuer: rawCertData.issuer || parsedCert.issuer,
                  validFrom: rawCertData.validFrom || parsedCert.validFrom,
                  validTo: rawCertData.validTo || parsedCert.validTo,
                };
                
                socket.end();
                resolve(combinedData);
              } catch (forgeErr) {
                console.error(`Forge parsing error: ${forgeErr.message}. Using raw data only.`);
                socket.end();
                resolve(rawCertData); // Still resolve with raw data on forge error
              }
            } else {
              // No raw data, just use what we extracted directly
              socket.end();
              resolve(rawCertData);
            }
          } catch (err) {
            console.error(`Error processing certificate: ${err.message}`);
            socket.end();
            reject(new Error(`Failed to process certificate: ${err.message}`));
          }
        }
      );
      
      // Handle connection errors
      socket.on('error', (err) => {
        console.error(`Connection error for ${host}:${port}: ${err.message}`);
        socket.end();
        reject(new Error(`Connection error: ${err.message}`));
      });
      
      // Handle timeouts
      socket.on('timeout', () => {
        console.error(`Connection timeout for ${host}:${port}`);
        socket.end();
        reject(new Error(`Connection timeout after ${timeout}ms`));
      });
      
      // Extra safeguard against stalled connections
      setTimeout(() => {
        if (socket.connecting) {
          console.error(`Forcibly closing stalled connection to ${host}:${port}`);
          socket.destroy();
          reject(new Error('Connection stalled - forcibly closed'));
        }
      }, timeout + 5000); // Wait a bit longer than the socket timeout
      
    } catch (error) {
      console.error(`Failed to create TLS connection to ${host}:${port}: ${error.message}`);
      reject(new Error(`Failed to establish secure connection: ${error.message}`));
    }
  });
}

// Helper function to extract certificate subject fields
function extractSubjectField(cert, fieldName) {
  if (!cert || !cert.subject) return '';
  
  // Handle both single string and RDN array formats
  if (typeof cert.subject === 'string') {
    const regex = new RegExp(`${fieldName}=([^,]+)`);
    const match = cert.subject.match(regex);
    return match ? match[1] : '';
  } else if (cert.subject instanceof Object) {
    return cert.subject[fieldName] || '';
  }
  
  return '';
}

// Format raw issuer information
function formatRawIssuer(issuer) {
  if (!issuer) return 'Unknown';
  
  // Handle string format
  if (typeof issuer === 'string') {
    return issuer;
  }
  
  // Handle object format
  if (issuer instanceof Object) {
    // Try common issuer fields in order of preference
    if (issuer.O) return issuer.O;
    if (issuer.CN) return issuer.CN;
    
    // Last resort - stringify the object
    try {
      const fieldPairs = [];
      for (const key in issuer) {
        if (issuer[key]) fieldPairs.push(`${key}=${issuer[key]}`);
      }
      return fieldPairs.join(', ') || 'Unknown';
    } catch (e) {
      return 'Unknown';
    }
  }
  
  return 'Unknown';
}

// Calculate days remaining
function calculateDaysRemaining(validTo) {
  if (!validTo) return 0;
  
  try {
    const expiryDate = new Date(validTo);
    const now = new Date();
    return Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
  } catch (e) {
    return 0;
  }
}

/**
 * Convert raw certificate data to PEM format
 * @param {Buffer} rawCert - Raw certificate data
 * @returns {Object} - Forge certificate object
 */
function convertToPem(rawCert) {
  if (!rawCert) {
    throw new Error('No raw certificate data');
  }
  
  // Convert raw buffer to DER
  const derCert = forge.util.createBuffer(rawCert.toString('binary'));
  // Convert DER to ASN.1
  const asnCert = forge.asn1.fromDer(derCert);
  // Convert ASN.1 to X.509 certificate
  return forge.pki.certificateFromAsn1(asnCert);
}

/**
 * Parse certificate and extract relevant information
 * @param {Object} cert - Forge certificate object
 * @returns {Object} - Extracted certificate data
 */
function parseCertificate(cert) {
  console.log('Raw certificate data:', JSON.stringify(cert, null, 2));
  
  // Calculate days remaining
  const validTo = new Date(cert.validity.notAfter);
  const now = new Date();
  const daysRemaining = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));
  
  // Format subject and issuer directly from raw certificate when possible
  const subjectFromRaw = cert.subject && typeof cert.subject === 'object' ? formatDN(cert.subject) : null;
  const issuerFromRaw = cert.issuer && typeof cert.issuer === 'object' ? formatDN(cert.issuer) : null;
  
  // Extract subject and issuer from raw fields if node-forge parsing fails
  const subject = subjectFromRaw || 'Unknown';
  const issuer = issuerFromRaw || 'Unknown';
  
  // Extract common name from subject
  let commonName = '';
  try {
    if (cert.subject && typeof cert.subject.getField === 'function' && cert.subject.getField('CN')) {
      commonName = cert.subject.getField('CN').value;
    } else if (cert.subject && cert.subject.attributes) {
      const cnAttr = cert.subject.attributes.find(attr => attr.name === 'commonName' || attr.shortName === 'CN');
      if (cnAttr) commonName = cnAttr.value;
    }
  } catch (e) {
    console.error('Error extracting CN:', e.message);
  }
  
  // Check if self-signed
  const selfSigned = issuer === subject;
  
  // Format dates in local timezone
  let validFrom, validToFormatted;
  try {
    validFrom = moment(cert.validity.notBefore).format('YYYY-MM-DD HH:mm:ss');
    validToFormatted = moment(cert.validity.notAfter).format('YYYY-MM-DD HH:mm:ss');
  } catch (e) {
    console.error('Error formatting dates:', e.message);
    validFrom = new Date().toISOString();
    validToFormatted = new Date().toISOString();
  }
  
  // Get certificate fingerprint in SHA-256 format
  let fingerprint = '';
  try {
    const md = forge.md.sha256.create();
    md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
    fingerprint = md.digest().toHex().match(/.{2}/g).join(':');
  } catch (e) {
    console.error('Error calculating fingerprint:', e.message);
    fingerprint = 'Could not calculate';
  }
  
  // Get signature algorithm
  let signatureAlgorithm = 'unknown';
  try {
    if (cert.siginfo && cert.siginfo.algorithmOid) {
      const oidMap = {
        '1.2.840.113549.1.1.1': 'RSA',
        '1.2.840.113549.1.1.2': 'MD2withRSA',
        '1.2.840.113549.1.1.4': 'MD5withRSA',
        '1.2.840.113549.1.1.5': 'SHA1withRSA',
        '1.2.840.113549.1.1.11': 'SHA256withRSA',
        '1.2.840.113549.1.1.12': 'SHA384withRSA',
        '1.2.840.113549.1.1.13': 'SHA512withRSA',
        '1.2.840.10045.4.3.2': 'ECDSA with SHA256',
        '1.2.840.10045.4.3.3': 'ECDSA with SHA384'
      };
      signatureAlgorithm = oidMap[cert.siginfo.algorithmOid] || `OID: ${cert.siginfo.algorithmOid}`;
    } else if (cert.signatureOid) {
      // Fall back to raw signature OID if available
      signatureAlgorithm = `OID: ${cert.signatureOid}`;
    }
  } catch (e) {
    console.error('Error determining signature algorithm:', e.message);
  }
  
  // Extract key usage if available
  let keyUsage = [];
  try {
    const keyUsageExt = cert.getExtension && typeof cert.getExtension === 'function' ? 
      cert.getExtension('keyUsage') : null;
      
    if (keyUsageExt) {
      if (keyUsageExt.digitalSignature) keyUsage.push('Digital Signature');
      if (keyUsageExt.nonRepudiation) keyUsage.push('Non Repudiation');
      if (keyUsageExt.keyEncipherment) keyUsage.push('Key Encipherment');
      if (keyUsageExt.dataEncipherment) keyUsage.push('Data Encipherment');
      if (keyUsageExt.keyAgreement) keyUsage.push('Key Agreement');
      if (keyUsageExt.keyCertSign) keyUsage.push('Certificate Signing');
      if (keyUsageExt.cRLSign) keyUsage.push('CRL Signing');
    }
  } catch (e) {
    console.error('Error extracting key usage:', e.message);
  }
  
  // Get organization info if available
  let organization = '';
  try {
    if (cert.subject && typeof cert.subject.getField === 'function' && cert.subject.getField('O')) {
      organization = cert.subject.getField('O').value;
    } else if (cert.subject && cert.subject.attributes) {
      const orgAttr = cert.subject.attributes.find(attr => attr.name === 'organizationName' || attr.shortName === 'O');
      if (orgAttr) organization = orgAttr.value;
    }
  } catch (e) {
    console.error('Error extracting organization:', e.message);
  }
  
  // Create the final certificate data object
  const certificateData = {
    host: cert.host || commonName,
    port: cert.port || 443,
    subject,
    issuer,
    commonName,
    organization,
    validFrom,
    validTo: validToFormatted,
    fingerprint,
    signatureAlgorithm,
    selfSigned,
    daysRemaining,
    keyUsage: keyUsage.join(', '),
    status: daysRemaining < 0 ? 'expired' : daysRemaining < 30 ? 'warning' : 'valid',
    lastScanned: new Date().toISOString()
  };
  
  console.log('Parsed certificate data:', JSON.stringify(certificateData, null, 2));
  return certificateData;
}

/**
 * Format Distinguished Name (DN) object to string
 * @param {Object} dn - Distinguished Name object
 * @returns {string} - Formatted DN string
 */
function formatDN(dn) {
  if (!dn || !dn.attributes) return 'Unknown';
  
  return dn.attributes.map(attr => {
    return `${attr.shortName || attr.name}=${attr.value}`;
  }).join(', ');
}

/**
 * Scan multiple hosts for SSL certificates
 * @param {Array} hosts - Array of hostnames or IP addresses
 * @param {Array} ports - Array of ports to scan
 * @param {number} timeout - Connection timeout in milliseconds
 * @returns {Promise<Array>} - Array of certificate data objects
 */
async function scanHosts(hosts, ports = [443], timeout = 5000) {
  const results = [];
  
  console.log(`Scanner: Starting scan of ${hosts.length} hosts on ${ports.length} ports`);
  
  for (const host of hosts) {
    try {
      // Check if it's an IP range with CIDR notation
      if (host.includes('/')) {
        console.log(`Scanner: IP range with CIDR detected: ${host}`);
        // We'll process this as a single host for now
        const hostResults = await scanHost(host, ports, timeout);
        results.push(...hostResults);
      } 
      // Check if it's an IP range with dash notation (e.g., 192.168.1.1-192.168.1.10)
      else if (host.includes('-')) {
        console.log(`Scanner: IP range with dash notation detected: ${host}`);
        // Process as a single host for now
        // In a more robust implementation, this would expand to multiple IPs
        const hostResults = await scanHost(host, ports, timeout);
        results.push(...hostResults);
      } 
      else {
        // Scan individual host
        const hostResults = await scanHost(host, ports, timeout);
        results.push(...hostResults);
      }
    } catch (error) {
      console.error(`Error scanning host ${host}: ${error.message}`);
      // Add error entry
      results.push({
        host,
        port: ports[0], // Use first port for error reporting
        status: 'error',
        error: error.message,
        lastScanned: new Date().toISOString()
      });
    }
  }
  
  console.log(`Scanner: Completed scan of all hosts, found ${results.length} results`);
  return results;
}

module.exports = {
  scanHost,
  scanHosts,
  getCertificate
};
