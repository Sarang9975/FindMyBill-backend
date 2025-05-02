const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  mobileNumber: {
    type: String,
    required: true,
    unique: true
  },
  passcode: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    default: ''
  },
  lastName: {
    type: String,
    default: ''
  },
  age: {
    type: Number,
    default: null
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  phoneVerificationAttempts: {
    type: Number,
    default: 0
  },
  lastVerificationSent: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('PhoneUser', userSchema, 'phoneUsers'); 
