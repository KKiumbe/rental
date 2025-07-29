const fs = require('fs');
const { Dropbox } = require('dropbox');

const dbx = new Dropbox({
  clientId: process.env.DROPBOX_APP_KEY,
  clientSecret: process.env.DROPBOX_APP_SECRET,
  refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
  fetch, // required by the SDK
});

async function uploadToDropbox(filePath) {
  const contents = fs.readFileSync(filePath);
  const fileName = filePath.split('/').pop();

  try {
    const response = await dbx.filesUpload({
      path: `/${fileName}`,
      contents,
      mode: { '.tag': 'overwrite' },
    });
    console.log('✅ Uploaded:', response.result.name);
  } catch (error) {
    console.error('❌ Upload failed:', error?.error || error.message || error);
  }
}

module.exports = { uploadToDropbox };
