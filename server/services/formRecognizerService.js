const { DocumentAnalysisClient } = require("@azure/ai-form-recognizer");
const { AzureKeyCredential } = require("@azure/core-auth");
const fs = require('fs').promises;

// Azure Form Recognizer configuration
const endpoint = process.env.AZURE_FORM_RECOGNIZER_ENDPOINT;
const apiKey = process.env.AZURE_FORM_RECOGNIZER_KEY;

if (!endpoint || !apiKey) {
  throw new Error('Azure Form Recognizer credentials are not configured');
}

// Initialize the Form Recognizer client with the latest pattern
const client = new DocumentAnalysisClient(
  endpoint,
  new AzureKeyCredential(apiKey)
);

// Helper function to format date
const formatDate = (dateValue) => {
  if (!dateValue) return '';
  try {
    // If it's already a date string in YYYY-MM-DD format, return as is
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    // If it's a Date object or date string, format it
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

const analyzeInvoice = async (filePath) => {
  try {
    console.log('Starting Azure Form Recognizer analysis for:', filePath);
    
    // Read the file
    const fileBuffer = await fs.readFile(filePath);
    
    // Start the analysis with the latest prebuilt-invoice model
    const poller = await client.beginAnalyzeDocument(
      "prebuilt-invoice",
      fileBuffer,
      {
        locale: "en-US"
      }
    );

    // Wait for the operation to complete
    const result = await poller.pollUntilDone();
    
    if (!result.documents || result.documents.length === 0) {
      throw new Error('No document results found');
    }

    const invoice = result.documents[0];
    console.log('Form Recognizer Raw Results:', JSON.stringify(invoice, null, 2));

    // Get all document content as a string to help with custom field extraction
    const documentContent = result.content;
    console.log('Document Content:', documentContent);

    // Helper function to extract value between labels
    const extractValueBetweenLabels = (content, startLabel, endLabel) => {
      const startIndex = content.indexOf(startLabel);
      if (startIndex === -1) return '';
      
      const valueStart = startIndex + startLabel.length;
      const remainingContent = content.substring(valueStart);
      
      const endIndex = endLabel ? remainingContent.indexOf(endLabel) : -1;
      return endIndex === -1 
        ? remainingContent.trim()
        : remainingContent.substring(0, endIndex).trim();
    };

    // Extract relevant fields with improved field access
    const extractedData = {
      vendorName: invoice.fields.VendorName?.value || invoice.fields.VendorName?.content || '',
      invoiceNumber: invoice.fields.InvoiceId?.value || invoice.fields.InvoiceId?.content || '',
      date: formatDate(invoice.fields.InvoiceDate?.value || invoice.fields.InvoiceDate?.content),
      time: '',
      productName: '',
      imeiSku: '',
      warrantyEndDate: formatDate(invoice.fields.ServiceEndDate?.value || invoice.fields.ServiceEndDate?.content)
    };

    // Extract custom fields from document content
    if (documentContent) {
      // Extract Product Name
      if (!extractedData.productName) {
        const productName = extractValueBetweenLabels(documentContent, 'Product Name:', 'Quantity:');
        if (productName) extractedData.productName = productName;
      }

      // Extract SKU
      if (!extractedData.imeiSku) {
        const sku = extractValueBetweenLabels(documentContent, 'SKU:', 'Product Name:');
        if (sku) extractedData.imeiSku = sku;
      }

      // Extract Warranty End Date if not already found
      if (!extractedData.warrantyEndDate) {
        const warrantyDate = extractValueBetweenLabels(documentContent, 'Warranty End Date:', 'Product Details:');
        if (warrantyDate) extractedData.warrantyEndDate = formatDate(warrantyDate);
      }

      // Extract time from date if available
      if (documentContent.includes('Date & Time:')) {
        const dateTime = extractValueBetweenLabels(documentContent, 'Date & Time:', '\n');
        if (dateTime) {
          const timeMatch = dateTime.match(/\d{2}:\d{2}:\d{2}/);
          if (timeMatch) {
            extractedData.time = timeMatch[0];
          }
        }
      }
    }

    // Clean up extracted data
    Object.keys(extractedData).forEach(key => {
      if (typeof extractedData[key] === 'string') {
        extractedData[key] = extractedData[key].trim();
      }
    });

    console.log('Extracted data:', extractedData);
    return extractedData;
  } catch (error) {
    console.error('Error in Azure Form Recognizer:', error);
    
    // Enhanced error handling for specific Azure errors
    if (error.statusCode) {
      switch (error.statusCode) {
        case 401:
          throw new Error('Azure Form Recognizer authentication failed. Please check your credentials.');
        case 403:
          throw new Error('Azure Form Recognizer access denied. Please check your permissions.');
        case 429:
          throw new Error('Azure Form Recognizer rate limit exceeded. Please try again later.');
        case 500:
          throw new Error('Azure Form Recognizer service error. Please try again later.');
        default:
          throw new Error(`Azure Form Recognizer error (${error.statusCode}): ${error.message}`);
      }
    }
    
    throw new Error(`Form Recognizer error: ${error.message}`);
  }
};

module.exports = {
  analyzeInvoice
}; 