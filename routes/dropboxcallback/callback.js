// routes/dropboxRoutes.js

const express = require('express');
const { handleDropboxCallback } = require('../../controller/jobs/dropboxcallback.js');
const router = express.Router();


router.get('/dropbox/callback', handleDropboxCallback);

module.exports = router;
