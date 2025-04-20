// routes/lease.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { getLeaseTerminationProgress, saveLeaseTerminationProgress, uploadMedia, createInvoice, finalizeLeaseTermination } = require("../../controller/lease/lease.js");
const verifyToken = require("../../middleware/verifyToken.js");


// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|mp4|mov/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only images (jpeg, jpg, png) and videos (mp4, mov) are allowed"));
  },
});

// Routes
router.get("/lease-termination-progress/:id",verifyToken, getLeaseTerminationProgress);
router.post("/lease-termination-progress/:id",verifyToken, saveLeaseTerminationProgress);
router.post("/upload-media", upload.single("file"),verifyToken, uploadMedia);
router.post("/lease-terminate-invoice",verifyToken, createInvoice);
router.post("/terminate-lease/:id",verifyToken, finalizeLeaseTermination);

module.exports = router;