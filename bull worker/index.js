const Bull = require('bull');
const fs = require('fs');
const readline = require('readline');
require('dotenv').config();

// Initialize Bull Queue
const logProcessingQueue = new Bull('log-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Log processing function
async function processLogFile(job) {
  const { filePath } = job.data;
  const logEntries = [];
  let processedLines = 0;
  let errorCount = 0;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  try {
    const readStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: readStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim() && !line.startsWith('#')) {
        logEntries.push(line);
      }
      processedLines++;
    }

    return { processedLines, entryCount: logEntries.length, errorCount };
  } catch (error) {
    console.error(`Job failed: ${error.message}`);
    throw error;
  }
}

// Worker Process
logProcessingQueue.process(processLogFile);

// Handle Events
logProcessingQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed: ${result.processedLines} lines processed.`);
});

logProcessingQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed: ${err.message}`);
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM. Shutting down worker...');
  await logProcessingQueue.close();
  process.exit(0);
});

console.log('🔧 Worker is running and waiting for jobs...');
