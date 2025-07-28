const fs = require('fs');
const { Dropbox } = require('dropbox');

const accessToken= process.env.DROPBOX_ACCESS_TOKEN

const dbx = new Dropbox({ accessToken });

async function uploadToDropbox(filePath) {
  const contents = fs.readFileSync(filePath);
  const fileName = filePath.split('/').pop();

  try {
    const response = await dbx.filesUpload({
      path: `/${fileName}`, // ⬅️ Upload directly to root
      contents,
      mode: { '.tag': 'overwrite' }, // safer overwrite config
    });
    console.log('✅ Uploaded:', response.result.name);
  } catch (error) {
    console.error('❌ Upload failed:', error?.error || error.message || error);
  }
}




module.exports = { uploadToDropbox };
