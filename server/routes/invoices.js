const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Invoice = require('../models/Invoice');
const auth = require('../middleware/auth');
const { analyzeInvoice } = require('../services/formRecognizerService');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and image files are allowed.'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Get all invoices for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const invoices = await Invoice.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ message: 'Server error while fetching invoices' });
  }
});

// Upload and process a new invoice
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = path.join(process.cwd(), req.file.path);
    
    // Analyze the invoice using Azure Form Recognizer
    const extractedData = await analyzeInvoice(filePath);
    
    // Create new invoice with extracted data
    const invoice = new Invoice({
      user: req.user.id,
      fileName: req.file.originalname,
      filePath: req.file.path,
      vendorName: extractedData.vendorName || '',
      productName: extractedData.productName || '',
      sku: extractedData.sku || '',
      invoiceNumber: extractedData.invoiceNumber || '',
      date: extractedData.date || new Date(),
      time: extractedData.time || '',
      warrantyEndDate: extractedData.warrantyEndDate || null
    });

    await invoice.save();
    
    // Return both the saved invoice and the extracted data
    res.status(201).json({
      message: 'Invoice uploaded and processed successfully',
      invoice,
      extractedData
    });

  } catch (error) {
    console.error('Error processing invoice:', error);
    // Clean up uploaded file if there's an error
    if (req.file) {
      fs.unlink(req.file.path, (unlinkError) => {
        if (unlinkError) console.error('Error deleting file:', unlinkError);
      });
    }
    res.status(500).json({ 
      message: 'Error processing invoice',
      error: error.message 
    });
  }
});

// Get a specific invoice
router.get('/:id', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, user: req.user.id });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ message: 'Server error while fetching invoice' });
  }
});

// Delete an invoice
router.delete('/:id', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, user: req.user.id });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Delete the file from the filesystem
    if (invoice.filePath) {
      fs.unlink(invoice.filePath, (error) => {
        if (error) console.error('Error deleting file:', error);
      });
    }

    await invoice.remove();
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ message: 'Server error while deleting invoice' });
  }
});

module.exports = router; 