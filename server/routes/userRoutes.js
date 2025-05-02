const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendOTP, verifyOTP } = require('../services/twilioService');

// @route   POST api/users/register
// @desc    Register a user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { mobileNumber, countryCode = '+91' } = req.body;

    // Validate input
    if (!mobileNumber) {
      return res.status(400).json({ msg: 'Please enter a mobile number' });
    }

    if (mobileNumber.length !== 10 || !/^\d+$/.test(mobileNumber)) {
      return res.status(400).json({ msg: 'Please enter a valid 10-digit mobile number' });
    }

    let user = await User.findOne({ mobileNumber });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Create user (but don't save yet)
    // Generate a random passcode - no longer needed by the user but required in the model
    const temporaryPasscode = Math.floor(1000 + Math.random() * 9000).toString();
    
    user = new User({
      mobileNumber,
      passcode: temporaryPasscode, // We'll hash this even though the user doesn't need to know it
    });

    // Hash the temporary passcode
    const salt = await bcrypt.genSalt(10);
    user.passcode = await bcrypt.hash(temporaryPasscode, salt);

    // Save the user
    await user.save();

    // Send OTP for verification
    const otpResult = await sendOTP(mobileNumber, countryCode);
    if (!otpResult.success) {
      return res.status(400).json({ msg: 'Failed to send verification code', error: otpResult.error });
    }

    // Update user with verification attempt information
    user.phoneVerificationAttempts = 1;
    user.lastVerificationSent = new Date();
    await user.save();

    res.status(200).json({ 
      msg: 'Verification code sent to your phone',
      mobileNumber,
      requiresVerification: true
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/users/verify
// @desc    Verify OTP and complete registration
// @access  Public
router.post('/verify', async (req, res) => {
  try {
    const { mobileNumber, otp, countryCode = '+91' } = req.body;

    // Validate input
    if (!mobileNumber || !otp) {
      return res.status(400).json({ msg: 'Please enter all fields' });
    }

    // Find the user
    const user = await User.findOne({ mobileNumber });
    if (!user) {
      return res.status(400).json({ msg: 'User not found' });
    }

    // Verify the OTP
    const verificationResult = await verifyOTP(mobileNumber, otp, countryCode);
    
    if (!verificationResult.success) {
      return res.status(400).json({ msg: 'Verification failed', error: verificationResult.error });
    }

    if (!verificationResult.valid) {
      return res.status(400).json({ msg: 'Invalid verification code' });
    }

    // Mark user as verified
    user.isPhoneVerified = true;
    await user.save();

    // Generate JWT token
    const payload = {
      user: {
        id: user.id,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '24h' },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/users/send-otp
// @desc    Send OTP to a registered user
// @access  Public
router.post('/send-otp', async (req, res) => {
  try {
    const { mobileNumber, countryCode = '+91' } = req.body;

    // Validate input
    if (!mobileNumber) {
      return res.status(400).json({ msg: 'Please enter your mobile number' });
    }

    if (mobileNumber.length !== 10 || !/^\d+$/.test(mobileNumber)) {
      return res.status(400).json({ msg: 'Please enter a valid 10-digit mobile number' });
    }

    // Find the user
    const user = await User.findOne({ mobileNumber });
    if (!user) {
      // If user doesn't exist, start the registration process
      return res.status(404).json({ msg: 'User not found. Please register first.' });
    }

    // Check if we can send a new verification code (rate limiting)
    const now = new Date();
    if (user.lastVerificationSent && now - user.lastVerificationSent < 60000) { // 1 minute
      return res.status(429).json({ msg: 'Please wait before requesting a new code' });
    }

    // Send OTP
    const otpResult = await sendOTP(mobileNumber, countryCode);
    if (!otpResult.success) {
      return res.status(400).json({ msg: 'Failed to send verification code', error: otpResult.error });
    }

    // Update user with verification attempt information
    user.phoneVerificationAttempts += 1;
    user.lastVerificationSent = now;
    await user.save();

    res.status(200).json({ 
      msg: 'Verification code sent to your phone',
      mobileNumber,
      requiresVerification: true
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-passcode');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
  try {
    const { firstName, lastName, age } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    user.firstName = firstName;
    user.lastName = lastName;
    user.age = age;

    await user.save();
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router; 