# CertifyEye - SSL Certificate Scanner

CertifyEye is a Node.js web application designed to scan and monitor SSL certificates on internal network servers. It helps organizations track certificate information, expiration dates, and ensures you're aware of certificates that are expiring soon.

## Features

- Scan internal servers by hostname or IP address
- Check SSL certificates on various ports (443, 8443, etc.)
- Track certificate details including issuer, validity dates, signature algorithm, and more
- Store certificate data in SQLite database
- Schedule regular scans to monitor your network
- View detailed certificate information
- Get alerts on expiring or invalid certificates

## Installation

1. Clone or download this repository
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

## Usage

### Starting the Application

```bash
npm start
```

The application will be available at http://localhost:3000

### Development Mode

To run the application in development mode with automatic restart:

```bash
npm run dev
```

## Main Components

- **Scanner**: Scans hosts for SSL certificates
- **Certificate Management**: View, search, and manage discovered certificates
- **Scheduler**: Set up regular automatic scans of your network

## Technical Details

This application uses:

- **Node.js** with Express for the backend
- **React** with TypeScript and Vite for the frontend UI
- **SQLite** (with better-sqlite3) for data storage
- **EJS** for backend view templates
- **node-forge** for certificate analysis
- **CORS** support for cross-origin communication

## Working with Internal Networks

When working with internal networks:
- Make sure the servers you're scanning are accessible from the machine running CertifyEye
- Self-signed certificates are properly detected and marked
- The application is configured to handle untrusted certificates (rejectUnauthorized: false)

## Supported Certificate Information

- Subject and Issuer details
- Validity period
- Signature algorithm
- Self-signed status
- Fingerprint
- Days remaining until expiration

## License

MIT

---

© CertifyEye
