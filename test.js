// upload-file.js

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

// Set the server URL and file path
const SERVER_URL = 'http://localhost:3000';
const LOG_FILE = path.join(__dirname, 'samp.txt'); // Update this to your file path if needed

async function uploadFile() {
  try {
    console.log(`Uploading file: ${LOG_FILE}`);
    
    // Create form data with log file
    const form = new FormData();
    form.append('file', fs.createReadStream(LOG_FILE)); // 'file' is the field name expected by the server
    
    // Upload log file for processing
    const uploadResponse = await axios.post(`${SERVER_URL}/api/process-logs`, form, {
      headers: {
        ...form.getHeaders()
      }
    });
    
    console.log('Upload successful!');
    console.log('Server response:', JSON.stringify(uploadResponse.data, null, 2));
    
    const { jobId } = uploadResponse.data;
    
    // Poll job status a few times
    console.log('\nChecking job status...');
    let attempts = 0;
    let jobCompleted = false;
    
    while (attempts < 10 && !jobCompleted) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
      
      try {
        console.log(`Checking status for job ${jobId} (attempt ${attempts + 1})...`);
        const statusResponse = await axios.get(`${SERVER_URL}/api/jobs/${jobId}`);
        console.log(`Status: ${statusResponse.data.state}`);
        
        if (statusResponse.data.state === 'completed') {
          console.log('\nJob completed!');
          if (statusResponse.data.data && statusResponse.data.data.entries) {
            console.log(`Processed ${statusResponse.data.data.entries.length} log entries`);
            console.log('First few entries:');
            console.log(JSON.stringify(statusResponse.data.data.entries.slice(0, 3), null, 2));
          } else {
            console.log('Job completed but no entries found in response.');
            console.log('Full response:', JSON.stringify(statusResponse.data, null, 2));
          }
          jobCompleted = true;
        } else if (statusResponse.data.state === 'failed') {
          console.error('Job failed:', statusResponse.data.error);
          break;
        }
      } catch (error) {
        console.error(`Error checking status: ${error.message}`);
        if (error.response) {
          console.error('Status:', error.response.status);
          console.error('Response data:', error.response.data);
        }
      }
      
      attempts++;
    }
    
    if (!jobCompleted) {
      console.log('Job did not complete within the expected time or failed.');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Server response:', error.response.data);
    }
  }
}

uploadFile();