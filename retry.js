// retry-client.js

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const SERVER_URL = 'http://localhost:3000';
const LOG_FILE = path.join(__dirname, 'samp.txt'); // Update with your file path

async function testJobRetry() {
  try {
    // First, upload a file to create a job
    console.log(`Uploading file: ${LOG_FILE}`);
    
    const form = new FormData();
    form.append('file', fs.createReadStream(LOG_FILE));
    
    const uploadResponse = await axios.post(`${SERVER_URL}/api/process-logs`, form, {
      headers: {
        ...form.getHeaders()
      }
    });
    
    console.log('Upload successful!');
    console.log('Server response:', JSON.stringify(uploadResponse.data, null, 2));
    
    const { jobId } = uploadResponse.data;
    
    // Check job status
    console.log('\nChecking job status...');
    let maxPolls = 10;
    let retried = false;
    
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      try {
        const statusResponse = await axios.get(`${SERVER_URL}/api/jobs/${jobId}`);
        const jobStatus = statusResponse.data;
        
        console.log(`\nStatus check ${i + 1}:`);
        console.log(`- State: ${jobStatus.state}`);
        console.log(`- Attempts: ${jobStatus.attemptsMade}/${jobStatus.maxAttempts}`);
        
        if (jobStatus.progress) {
          console.log(`- Progress: ${JSON.stringify(jobStatus.progress)}`);
        }
        
        if (jobStatus.failedReason) {
          console.log(`- Failed reason: ${jobStatus.failedReason}`);
        }
        
        // If the job has failed and we haven't retried yet, trigger a manual retry
        if (jobStatus.state === 'failed' && !retried) {
          console.log('\n⚠️ Job failed! Triggering manual retry...');
          
          try {
            const retryResponse = await axios.post(`${SERVER_URL}/api/jobs/${jobId}/retry`);
            console.log('Retry response:', retryResponse.data);
            retried = true;
          } catch (retryError) {
            console.error('Error triggering retry:', retryError.message);
            if (retryError.response) {
              console.error('Server response:', retryError.response.data);
            }
          }
          
          // Give the system some time to process the retry
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Exit early if the job completes
        if (jobStatus.state === 'completed') {
          console.log('\n✅ Job completed successfully!');
          if (jobStatus.data && jobStatus.data.entries) {
            console.log(`Processed ${jobStatus.data.entries.length} log entries`);
            console.log('First few entries:');
            console.log(JSON.stringify(jobStatus.data.entries.slice(0, 3), null, 2));
          }
          break;
        }
      } catch (error) {
        console.error(`Error checking status: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Server response:', error.response.data);
    }
  }
}

testJobRetry();