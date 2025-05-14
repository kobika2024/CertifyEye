const schedule = require('node-schedule');
const moment = require('moment');
const scanner = require('./scanner');
const db = require('./database');

// Store active jobs
const activeJobs = new Map();

/**
 * Initialize the scheduler and load all active scheduled scans
 */
async function initializeScheduler() {
  console.log('Initializing scheduler...');
  
  // Cancel any existing jobs
  cancelAllJobs();
  
  try {
    // Load all active scheduled scans
    const scheduledScans = await db.getAllScheduledScans();
    
    for (const scan of scheduledScans) {
      if (scan.active) {
        scheduleJob(scan);
      }
    }
    
    console.log(`Scheduler initialized with ${activeJobs.size} active jobs`);
  } catch (err) {
    console.error('Error initializing scheduler:', err.message);
  }
}

/**
 * Schedule a job based on scan configuration
 * @param {Object} scan - Scheduled scan configuration
 */
function scheduleJob(scan) {
  // Cancel any existing job for this scan
  if (activeJobs.has(scan.id)) {
    activeJobs.get(scan.id).cancel();
    activeJobs.delete(scan.id);
  }
  
  if (!scan.active) {
    console.log(`Scan "${scan.name}" (ID: ${scan.id}) is inactive, skipping scheduling`);
    return;
  }
  
  try {
    // Parse frequency to create schedule rule
    let rule;
    
    switch (scan.frequency) {
      case 'hourly':
        rule = '0 * * * *'; // Every hour
        break;
      case 'daily':
        rule = '0 0 * * *'; // Every day at midnight
        break;
      case 'weekly':
        rule = '0 0 * * 0'; // Every Sunday at midnight
        break;
      case 'monthly':
        rule = '0 0 1 * *'; // 1st of each month at midnight
        break;
      default:
        // Try to parse as custom cron expression
        rule = scan.frequency;
    }
    
    // Schedule the job
    const job = schedule.scheduleJob(rule, async function() {
      console.log(`Running scheduled scan: ${scan.name} (ID: ${scan.id})`);
      
      try {
        // Perform the scan
        const results = await scanner.scanHosts(scan.hosts, scan.ports);
        
        // Save results to database
        for (const cert of results) {
          await db.saveCertificate(cert);
        }
        
        // Update last run and next run times
        const lastRun = new Date().toISOString();
        const nextRun = job.nextInvocation().toISOString();
        await db.updateScheduledScanTimes(scan.id, lastRun, nextRun);
        
        console.log(`Completed scheduled scan: ${scan.name} (ID: ${scan.id})`);
      } catch (err) {
        console.error(`Error running scheduled scan ${scan.name} (ID: ${scan.id}):`, err.message);
      }
    });
    
    // Store the job
    activeJobs.set(scan.id, job);
    
    // Calculate next run time
    const nextRun = job.nextInvocation().toISOString();
    
    // Update next run time in database
    db.updateScheduledScanTimes(scan.id, scan.lastRun || null, nextRun)
      .catch(err => console.error(`Error updating next run time for scan ${scan.id}:`, err.message));
    
    console.log(`Scheduled scan "${scan.name}" (ID: ${scan.id}) - Next run: ${moment(nextRun).format('YYYY-MM-DD HH:mm:ss')}`);
  } catch (err) {
    console.error(`Error scheduling scan "${scan.name}" (ID: ${scan.id}):`, err.message);
  }
}

/**
 * Cancel all scheduled jobs
 */
function cancelAllJobs() {
  for (const [id, job] of activeJobs.entries()) {
    job.cancel();
    console.log(`Cancelled job for scan ID: ${id}`);
  }
  
  activeJobs.clear();
}

/**
 * Get all active scheduled jobs with their next run times
 * @returns {Array} - Array of job information objects
 */
function getActiveJobs() {
  const jobs = [];
  
  for (const [id, job] of activeJobs.entries()) {
    jobs.push({
      id,
      nextRun: job.nextInvocation().toISOString()
    });
  }
  
  return jobs;
}

/**
 * Run a scheduled scan immediately
 * @param {number} scanId - ID of the scheduled scan to run
 * @returns {Promise<Array>} - Array of scan results
 */
async function runScanNow(scanId) {
  const scan = await db.getScheduledScanById(scanId);
  
  if (!scan) {
    throw new Error(`Scheduled scan with ID ${scanId} not found`);
  }
  
  console.log(`Running scheduled scan immediately: ${scan.name} (ID: ${scan.id})`);
  
  // Perform the scan
  const results = await scanner.scanHosts(scan.hosts, scan.ports);
  
  // Save results to database
  for (const cert of results) {
    await db.saveCertificate(cert);
  }
  
  // Update last run time (next run time stays the same)
  const lastRun = new Date().toISOString();
  await db.updateScheduledScanTimes(scan.id, lastRun, scan.nextRun);
  
  console.log(`Completed immediate run of scheduled scan: ${scan.name} (ID: ${scan.id})`);
  
  return results;
}

module.exports = {
  initializeScheduler,
  scheduleJob,
  cancelAllJobs,
  getActiveJobs,
  runScanNow
};
