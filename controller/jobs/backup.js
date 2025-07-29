require('dotenv').config({ quiet: true });
const { exec } = require('child_process');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs').promises;
const path = require('path');

const lockfile = require('proper-lockfile');
const { uploadToDropbox } = require('./backupToDropbox');

const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_NAME = process.env.DB_NAME;
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const RETENTION_DAYS = 7; // Keep backups for 7 days
const instanceId = process.env.PM2_NODE_ID || `pid-${process.pid}`;

// Debug: Log environment variables and process info at startup
console.log(`[${instanceId}] Starting backup service. PM2_NODE_ID=${process.env.PM2_NODE_ID}, PID=${process.pid}`);

const backupDatabase = async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `backup-rental-${timestamp}.dump`);

    // Ensure backup directory exists
    if (!(await fs.stat(BACKUP_DIR).catch(() => false))) {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
      console.log(`[${instanceId}] Created backup directory: ${BACKUP_DIR}`);
    }

    // Use pg_dump with -Fc for custom format (.dump)
    const backupCommand = `PGPASSWORD="${DB_PASSWORD}" pg_dump -U ${DB_USER} -h ${DB_HOST} -Fc ${DB_NAME} -f ${backupFile}`;
    console.log(`[${instanceId}] Executing: ${backupCommand.replace(DB_PASSWORD, '****')}`);

    await new Promise((resolve, reject) => {
      exec(backupCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`[${instanceId}] Backup failed: ${stderr || error.message}`);
          reject(error);
        } else {
          console.log(`[${instanceId}] Backup created: ${backupFile}`);
          resolve(backupFile);
        }
      });
    });

    try {
      await uploadToDropbox(backupFile);
    } catch (error) {
      console.error(`[${instanceId}] Failed to upload to Dropbox: ${error.message}`);
    }

    return backupFile;
  } catch (error) {
    throw new Error(`[${instanceId}] Backup process failed: ${error.message}`);
  }
};

const deleteOldBackups = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    let deletedCount = 0;
    let skippedCount = 0;

    const files = await fs.readdir(BACKUP_DIR);
    for (const file of files) {
      if (!file.endsWith('.dump')) continue;
      
      const filePath = path.join(BACKUP_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile() && stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          console.log(`[${instanceId}] Deleted old backup: ${filePath}`);
          deletedCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`[${instanceId}] File ${filePath} not found, skipping.`);
          skippedCount++;
        } else {
          console.error(`[${instanceId}] Error processing file ${filePath}: ${error.message}`);
        }
      }
    }
    console.log(`[${instanceId}] Cleanup complete: ${deletedCount} files deleted, ${skippedCount} files skipped.`);
  } catch (error) {
    console.error(`[${instanceId}] Error in cleanup task: ${error.message}`);
    throw error;
  }
};

const acquireLock = async () => {
  const lockFile = path.join(BACKUP_DIR, 'backup.lock');
  
  try {
    // Try to acquire lock with 10 second timeout and automatic release after 5 minutes
    const release = await lockfile.lock(BACKUP_DIR, {
      lockfilePath: lockFile,
      retries: 3,
      stale: 300000, // 5 minutes
      update: 60000, // Update lock every minute
      realpath: false
    });
    
    console.log(`[${instanceId}] Acquired backup lock`);
    return release;
  } catch (error) {
    if (error.code === 'ELOCKED') {
      console.log(`[${instanceId}] Backup is already running in another instance`);
      return null;
    }
    console.error(`[${instanceId}] Error acquiring lock: ${error.message}`);
    return null;
  }
};

const runTask = async () => {
  const releaseLock = await acquireLock();
  if (!releaseLock) return;

  try {
    console.log(`[${instanceId}] Starting backup and cleanup task...`);
    await backupDatabase();
    await deleteOldBackups();
    console.log(`[${instanceId}] Task completed successfully.`);
  } catch (error) {
    console.error(`[${instanceId}] Task failed: ${error.message}`);
  } finally {
    if (releaseLock) {
      try {
        await releaseLock();
        console.log(`[${instanceId}] Released backup lock`);
      } catch (error) {
        console.error(`[${instanceId}] Error releasing lock: ${error.message}`);
      }
    }
  }
};

module.exports = () => {
  if (!DB_USER || !DB_PASSWORD || !DB_NAME || !DB_HOST || !BACKUP_DIR) {
    console.error(`[${instanceId}] Missing required environment variables (DB_USER, DB_PASSWORD, DB_NAME, DB_HOST, BACKUP_DIR).`);
    return;
  }
//every 1 am in kenya 

  
  cron.schedule('* * * * * *', () => {
    console.log(`[${instanceId}] Triggering backup task at: ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}`);
    runTask();
  }, {
    scheduled: true,
    timezone: 'Africa/Nairobi',
  });

  console.log(`[${instanceId}] ✅ Scheduler started. Will run every 1 AM`);
};