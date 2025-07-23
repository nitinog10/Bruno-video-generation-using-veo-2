/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GenerateVideosParameters, GoogleGenAI} from '@google/genai';

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      // The result includes the 'data:mime/type;base64,' prefix, which we need to remove.
      resolve(url.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });
}

function downloadFile(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function generateContent(prompt: string, imageBytes: string) {
  // Use API key from environment variables
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error('API_KEY environment variable not set.');
  }
  const ai = new GoogleGenAI({apiKey});

  const config: GenerateVideosParameters = {
    model: 'veo-2.0-generate-001',
    prompt,
    config: {
      numberOfVideos: 1,
    },
  };

  if (imageBytes) {
    config.image = {
      imageBytes,
      mimeType: 'image/png', // Assuming PNG, might need to be dynamic
    };
  }

  let operation = await ai.models.generateVideos(config);

  while (!operation.done) {
    console.log('Waiting for completion...');
    await delay(1000); // Wait 1 second before checking status again
    operation = await ai.operations.getVideosOperation({operation});
  }

  const videos = operation.response?.generatedVideos;
  if (videos === undefined || videos.length === 0) {
    throw new Error('No videos were generated.');
  }

  // Handle video download and display
  for (const [i, v] of videos.entries()) {
    const url = decodeURIComponent(v.video.uri);
    const res = await fetch(url);
    const blob = await res.blob();
    const objectURL = URL.createObjectURL(blob);
    
    downloadFile(objectURL, `bruno-video-${i}.mp4`);
    
    const videoEl = document.querySelector('#video') as HTMLVideoElement;
    videoEl.src = objectURL;
    videoEl.style.display = 'block';
    console.log(`Downloaded video: bruno-video-${i}.mp4`);
  }
}

// DOM Element selectors
const upload = document.querySelector('#file-input') as HTMLInputElement;
const promptEl = document.querySelector('#prompt-input') as HTMLTextAreaElement;
const generateButton = document.querySelector('#generate-button') as HTMLButtonElement;
const statusEl = document.querySelector('#status') as HTMLParagraphElement;
const loaderEl = document.querySelector('#loader') as HTMLDivElement;
const videoEl = document.querySelector('#video') as HTMLVideoElement;
const quotaErrorEl = document.querySelector('#quota-error') as HTMLDivElement;
const openKeyEl = document.querySelector('#open-key') as HTMLButtonElement;
const imagePreview = document.querySelector('#image-preview') as HTMLImageElement;
const imagePreviewContainer = document.querySelector('#image-preview-container') as HTMLDivElement;
const fileNameSpan = document.querySelector('#file-name') as HTMLSpanElement;

// State variables
let base64data = '';

// Event Listeners
upload.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    fileNameSpan.textContent = file.name;
    // Show preview
    const reader = new FileReader();
    reader.onload = (event) => {
      imagePreview.src = event.target?.result as string;
      imagePreviewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
    // Prepare for API
    base64data = await blobToBase64(file);
  } else {
    base64data = '';
    fileNameSpan.textContent = 'No file chosen';
    imagePreview.src = '';
    imagePreviewContainer.style.display = 'none';
  }
});

openKeyEl.addEventListener('click', async () => {
  await window.aistudio?.openSelectKey();
});

generateButton.addEventListener('click', () => {
  if (promptEl.value.trim() === '') {
      statusEl.innerText = "Please enter a prompt.";
      return;
  }
  generate();
});

async function generate() {
  // Reset UI
  statusEl.innerText = '';
  loaderEl.style.display = 'block';
  videoEl.style.display = 'none';
  quotaErrorEl.style.display = 'none';

  // Disable inputs
  generateButton.disabled = true;
  upload.disabled = true;
  promptEl.disabled = true;

  try {
    statusEl.innerText = 'Generating video... this may take a moment.';
    await generateContent(promptEl.value, base64data);
    statusEl.innerText = 'Success! Your video has been generated and downloaded.';
  } catch (e: any) {
    console.error('Generation Error:', e);
    let errorMessage = 'An unexpected error occurred.';
    let isQuotaError = false;

    // Check for quota error in various possible formats
    try {
      let errorSource = e;
      // If the primary error has a string message, it might be JSON.
      // Parse it to get to the real error object.
      if (typeof e?.message === 'string') {
        try {
          errorSource = JSON.parse(e.message);
        } catch {
          // Not JSON, check the string itself for keywords
          if (e.message.includes('429') || e.message.includes('RESOURCE_EXHAUSTED')) {
            isQuotaError = true;
          }
        }
      }
      
      // Now check the (potentially parsed) error source
      const details = errorSource?.error || errorSource;
      if (details?.code === 429 || details?.status === 'RESOURCE_EXHAUSTED') {
        isQuotaError = true;
      }

    } catch {
      // Fallback if parsing or property access fails
    }

    if (isQuotaError) {
      quotaErrorEl.style.display = 'block';
      statusEl.innerText = ''; // Clear status message
    } else {
      // Determine the best message to show
      if (e?.error?.message) {
        errorMessage = e.error.message;
      } else if (e?.message) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      }
      statusEl.innerText = errorMessage;
    }
  } finally {
    // Re-enable UI
    loaderEl.style.display = 'none';
    generateButton.disabled = false;
    upload.disabled = false;
    promptEl.disabled = false;
  }
}

// Ensure initial state is correct
statusEl.innerText = 'Ready.';
