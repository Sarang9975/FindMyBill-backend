const twilio = require('twilio');

// Initialize Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Create a Verify service if not already specified in .env
const createVerifyService = async () => {
  if (!process.env.TWILIO_VERIFY_SERVICE_SID) {
    try {
      const service = await client.verify.v2.services.create({
        friendlyName: 'FindMyBill Phone Verification'
      });
      console.log(`Created verify service: ${service.sid}`);
      // Note: You should add this to your .env file permanently
      process.env.TWILIO_VERIFY_SERVICE_SID = service.sid;
      return service.sid;
    } catch (error) {
      console.error('Error creating verify service:', error);
      throw error;
    }
  }
  return process.env.TWILIO_VERIFY_SERVICE_SID;
};

// Send OTP to a phone number
const sendOTP = async (phoneNumber, countryCode = '+91') => {
  try {
    // Format the phone number with country code
    const formattedNumber = phoneNumber.startsWith('+')
      ? phoneNumber
      : `${countryCode}${phoneNumber}`;

    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID || await createVerifyService();
    
    const verification = await client.verify.v2.services(serviceSid)
      .verifications.create({
        to: formattedNumber,
        channel: 'sms'
      });
    
    return {
      success: true,
      status: verification.status
    };
  } catch (error) {
    console.error('Error sending OTP:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Verify OTP entered by user
const verifyOTP = async (phoneNumber, otpCode, countryCode = '+91') => {
  try {
    // Format the phone number with country code
    const formattedNumber = phoneNumber.startsWith('+')
      ? phoneNumber
      : `${countryCode}${phoneNumber}`;

    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID || await createVerifyService();
    
    const verification = await client.verify.v2.services(serviceSid)
      .verificationChecks.create({
        to: formattedNumber,
        code: otpCode
      });
    
    return {
      success: true,
      valid: verification.status === 'approved',
      status: verification.status
    };
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      valid: false,
      error: error.message
    };
  }
};

module.exports = {
  sendOTP,
  verifyOTP
}; 