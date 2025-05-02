const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vendorName: {
    type: String,
    required: false,
    default: ''
  },
  productName: {
    type: String,
    required: false,
    default: ''
  },
  invoiceNumber: {
    type: String,
    required: false,
    default: ''
  },
  date: {
    type: String,
    required: false,
    default: ''
  },
  time: {
    type: String,
    required: false,
    default: ''
  },
  imeiSku: {
    type: String,
    required: false,
    default: ''
  },
  warrantyEndDate: {
    type: String,
    required: false,
    default: ''
  },
  fileUrl: {
    type: String,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema); 