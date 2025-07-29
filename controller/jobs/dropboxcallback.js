const axios = require('axios');

const handleDropboxCallback = async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`Dropbox auth error: ${error}`);
  }

  if (!code) {
    return res.status(400).send('No authorization code received.');
  }

  try {
    const tokenResponse = await axios.post('https://api.dropboxapi.com/oauth2/token', null, {
      auth: {
        username: process.env.DROPBOX_APP_KEY,
        password: process.env.DROPBOX_APP_SECRET,
      },
      params: {
        code,
        grant_type: 'authorization_code',
        redirect_uri: 'https://rentke.co.ke/api/dropbox/callback',
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    console.log('📦 Dropbox Access Token:', access_token);
    console.log('🔁 Dropbox Refresh Token:', refresh_token);
    console.log('⏰ Expires In:', expires_in + ' seconds');

    // Optional: Save to secure database or file (NOT RECOMMENDED to write to .env dynamically in prod)

    return res.send(`
      <h2>✅ Dropbox Connected Successfully!</h2>
      <p><strong>Refresh Token:</strong></p>
      <code style="font-size: 16px; background: #eee; padding: 5px 10px;">${refresh_token}</code>
      <p>Copy and paste this into your server's <code>.env</code> file as <code>DROPBOX_REFRESH_TOKEN</code></p>
    `);
  } catch (err) {
    console.error('❌ Error exchanging code:', err?.response?.data || err.message);
    return res.status(500).send('Failed to exchange Dropbox code for refresh token.');
  }
};

module.exports = { handleDropboxCallback };
