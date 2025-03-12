// // index.js with enhanced retry mechanism

// const express = require('express');
// const multer = require('multer');
// const fs = require('fs');
// const readline = require('readline');
// const Bull = require('bull');
// const path = require('path');

// // Initialize express application
// const app = express();
// const port = process.env.PORT || 3000;

// // Configure multer for file uploads
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, 'uploads/')
//   },
//   filename: function (req, file, cb) {
//     cb(null, `${Date.now()}-${file.originalname}`)
//   }
// });

// const upload = multer({ storage: storage });

// // Create Bull queue for log processing with retry configuration
// const logProcessingQueue = new Bull('log-processing', {
//   redis: {
//     host: process.env.REDIS_HOST || 'localhost',
//     port: process.env.REDIS_PORT || 6379
//   },
//   defaultJobOptions: {
//     attempts: 5, // Increased retry attempts
//     backoff: {
//       type: 'exponential', // Exponential backoff strategy
//       delay: 5000 // Starting delay of 5 seconds
//     },
//     removeOnComplete: false, // Keep job history for monitoring
//     removeOnFail: false      // Keep failed jobs for inspection
//   }
// });

// // Parse log line using regex
// function parseLogLine(line) {
//   try {
//     // Regex to match: [TIMESTAMP] LEVEL MESSAGE {optional JSON}
//     const regex = /\[(.*?)\]\s+(\w+)\s+(.*?)(?:\s+(\{.*\}))?$/;
//     const match = line.match(regex);

//     if (!match) return null;

//     let [, timestamp, level, message, jsonPayload] = match;
    
//     // Parse JSON payload if it exists
//     let parsedPayload = {};
//     if (jsonPayload) {
//       try {
//         parsedPayload = JSON.parse(jsonPayload);
//       } catch (err) {
//         console.error(`Error parsing JSON payload: ${err.message}, payload: ${jsonPayload}`);
//         // Instead of failing completely, just log the error and continue without the JSON payload
//       }
//     }

//     return {
//       timestamp,
//       level,
//       message,
//       ...parsedPayload
//     };
//   } catch (error) {
//     console.error(`Error parsing log line: ${error.message}, line: ${line}`);
//     return null; // Skip this line but don't fail the entire process
//   }
// }

// // Process log file job with detailed error handling
// logProcessingQueue.process(async (job) => {
//   const { filePath } = job.data;
//   const logEntries = [];
//   let processedLines = 0;
//   let errorCount = 0;
  
//   // Validate file exists and is readable
//   if (!fs.existsSync(filePath)) {
//     throw new Error(`File not found: ${filePath}`);
//   }
  
//   try {
//     // Create read stream for large file processing
//     const readStream = fs.createReadStream(filePath);
    
//     // Handle read stream errors
//     readStream.on('error', (error) => {
//       throw new Error(`Error reading file: ${error.message}`);
//     });
    
//     const rl = readline.createInterface({
//       input: readStream,
//       crlfDelay: Infinity
//     });

//     // Process file line by line with better error handling
//     for await (const line of rl) {
//       try {
//         if (line.trim() && !line.startsWith('#')) {
//           const parsedLine = parseLogLine(line);
//           if (parsedLine) {
//             logEntries.push(parsedLine);
//           } else {
//             errorCount++;
//           }
//         }
        
//         processedLines++;
//         if (processedLines % 10000 === 0) {
//           // Update job progress every 10,000 lines
//           await job.progress({
//             processedLines,
//             validEntries: logEntries.length,
//             errorCount
//           });
//         }
//       } catch (lineError) {
//         errorCount++;
//         console.error(`Error processing line #${processedLines}: ${lineError.message}`);
//         // Continue processing other lines
//       }
//     }
    
//     // Final progress update
//     await job.progress({
//       processedLines,
//       validEntries: logEntries.length,
//       errorCount
//     });
    
//     return {
//       processedLines,
//       entryCount: logEntries.length,
//       errorCount,
//       entries: logEntries
//     };
//   } catch (error) {
//     console.error(`Job failed: ${error.message}`);
//     // Throwing will cause Bull to retry the job according to retry settings
//     throw error;
//   }
// });

// // API endpoint to upload and process log file
// app.post('/api/process-logs', upload.single('file'), async (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ error: 'No file uploaded' });
//   }

//   try {
//     // Add job to queue with configured retry options
//     const job = await logProcessingQueue.add({
//       filePath: path.resolve(req.file.path),
//       originalFilename: req.file.originalname,
//       uploadedAt: new Date().toISOString()
//     });

//     res.json({
//       message: 'Log file queued for processing',
//       jobId: job.id,
//       fileInfo: req.file
//     });
//   } catch (error) {
//     console.error('Error queuing job:', error);
//     res.status(500).json({ error: 'Failed to queue log processing job' });
//   }
// });

// // Add this to your route handler for GET /api/jobs/:id
// app.get('/api/jobs/:id', async (req, res) => {
//     try {
//       const { id } = req.params;
      
//       // Get job from queue
//       const job = await logProcessingQueue.getJob(id);
      
//       if (!job) {
//         return res.status(404).json({ error: 'Job not found' });
//       }
      
//       // Get job state
//       const state = await job.getState();
      
//       // Prepare response based on job state
//       const response = {
//         id: job.id,
//         state: state,
//       };
      
//       // Include job result if completed
//       if (state === 'completed') {
//         response.data = job.returnvalue;
//       } else if (state === 'failed') {
//         response.error = job.failedReason;
//       }
      
//       // Don't try to call getLogs() which doesn't exist
//       // Instead, use job.data to get original job data if needed
//       response.originalData = job.data;
      
//       return res.json(response);
//     } catch (error) {
//       console.error('Error fetching job:', error);
//       return res.status(500).json({ error: `Failed to fetch job: ${error.message}` });
//     }
//   });
// // API endpoint to manually retry a failed job
// app.post('/api/jobs/:jobId/retry', async (req, res) => {
//   const { jobId } = req.params;
  
//   try {
//     const job = await logProcessingQueue.getJob(jobId);
    
//     if (!job) {
//       return res.status(404).json({ error: 'Job not found' });
//     }
    
//     const state = await job.getState();
    
//     if (state !== 'failed') {
//       return res.status(400).json({ error: 'Only failed jobs can be retried', currentState: state });
//     }
    
//     await job.retry();
    
//     res.json({
//       message: `Job ${jobId} queued for retry`,
//       jobId: job.id
//     });
//   } catch (error) {
//     console.error('Error retrying job:', error);
//     res.status(500).json({ error: 'Failed to retry job' });
//   }
// });

// // Error handling middleware
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).json({ error: 'Something went wrong!', details: err.message });
// });

// // Make sure uploads directory exists
// if (!fs.existsSync('uploads')) {
//   fs.mkdirSync('uploads');
// }

// // Start the server
// app.listen(port, () => {
//   console.log(`Server running on port ${port}`);
// });

// // Handle Bull events with more detailed logging
// logProcessingQueue.on('completed', (job, result) => {
//   console.log(`✅ Job ${job.id} completed. Processed ${result.processedLines} lines with ${result.entryCount} valid entries and ${result.errorCount} errors.`);
// });

// logProcessingQueue.on('failed', (job, err) => {
//   console.error(`❌ Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`);
// });

// logProcessingQueue.on('retrying', (job, err) => {
//   console.warn(`⚠️ Retrying job ${job.id} (attempt ${job.attemptsMade}/${job.opts.attempts}). Previous error: ${err.message}`);
// });

// // Graceful shutdown
// process.on('SIGTERM', async () => {
//   console.log('Received SIGTERM. Shutting down gracefully...');
//   await logProcessingQueue.close();
//   process.exit(0);
// });



const express = require('express');
const multer = require('multer');
const Bull = require('bull');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Multer setup
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Initialize Bull Queue
const logProcessingQueue = new Bull('log-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// API: Upload file and enqueue job
app.post('/api/process-logs', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const job = await logProcessingQueue.add({
      filePath: path.resolve(req.file.path),
      originalFilename: req.file.originalname,
      uploadedAt: new Date().toISOString()
    });

    res.json({ message: 'Log file queued', jobId: job.id });
  } catch (error) {
    console.error('Error queuing job:', error);
    res.status(500).json({ error: 'Failed to queue job' });
  }
});

// Start API server
app.listen(port, () => {
  console.log(`🚀 API server running on port ${port}`);
});
