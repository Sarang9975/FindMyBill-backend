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
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// @route   POST api/invoices
// @desc    Create an invoice
// @access  Private
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log('File uploaded:', req.file);

    let {
      vendorName = '',
      productName = '',
      invoiceNumber = '',
      date = '',
      time = '',
      imeiSku = '',
      warrantyEndDate = '',
    } = req.body;

    try {
      // Process the uploaded file with Azure Form Recognizer
      console.log('Starting Azure Form Recognizer processing');
      const extractedFields = await analyzeInvoice(req.file.path);
      console.log('Form Recognizer processing completed:', extractedFields);

      // Use extracted fields as fallback if manual input is not provided
      vendorName = vendorName || extractedFields.vendorName || '';
      productName = productName || extractedFields.productName || '';
      invoiceNumber = invoiceNumber || extractedFields.invoiceNumber || '';
      date = date || extractedFields.date || '';
      time = time || extractedFields.time || '';
      imeiSku = imeiSku || extractedFields.imeiSku || '';
      warrantyEndDate = warrantyEndDate || extractedFields.warrantyEndDate || '';

      const newInvoice = new Invoice({
        userId: req.user.id,
        vendorName,
        productName,
        invoiceNumber,
        date,
        time,
        imeiSku,
        warrantyEndDate,
        fileUrl: req.file.path,
      });

      const invoice = await newInvoice.save();
      
      // Return both the saved invoice and the extracted fields
      res.json({
        invoice,
        extractedFields,
        message: 'Invoice saved successfully'
      });
    } catch (recognizerError) {
      console.error('Form Recognizer Error:', recognizerError);
      
      // If Form Recognizer fails, we'll still save the invoice with manual data
      const newInvoice = new Invoice({
        userId: req.user.id,
        vendorName: vendorName || '',
        productName: productName || '',
        invoiceNumber: invoiceNumber || '',
        date: date || '',
        time: time || '',
        imeiSku: imeiSku || '',
        warrantyEndDate: warrantyEndDate || '',
        fileUrl: req.file.path,
      });

      const invoice = await newInvoice.save();
      
      // Return the saved invoice and error message
      res.json({
        invoice,
        extractedFields: {},
        message: 'Invoice saved with manual data only',
        recognizerError: recognizerError.message
      });
    }
  } catch (err) {
    console.error('Server Error:', err);
    // Clean up uploaded file if there's an error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    res.status(500).json({ 
      message: 'Server error', 
      error: err.message,
      details: err.errors ? Object.keys(err.errors).map(key => ({
        field: key,
        message: err.errors[key].message
      })) : undefined
    });
  }
});

// @route   GET api/invoices
// @desc    Get all invoices for a user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const invoices = await Invoice.find({ userId: req.user.id }).sort({ date: -1 });
    res.json({ data: invoices });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/invoices/:id
// @desc    Get invoice by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ msg: 'Invoice not found' });
    }

    if (invoice.userId.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    res.json(invoice);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   DELETE api/invoices/:id
// @desc    Delete an invoice
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ msg: 'Invoice not found' });
    }

    if (invoice.userId.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    // Delete the file
    fs.unlinkSync(invoice.fileUrl);

    await invoice.remove();
    res.json({ msg: 'Invoice removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/invoices/:id/download
// @desc    Download invoice file
// @access  Private
router.get('/:id/download', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ msg: 'Invoice not found' });
    }

    if (invoice.userId.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    res.download(invoice.fileUrl);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router; 