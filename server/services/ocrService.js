const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const extractTextFromImage = async (imagePath) => {
  try {
    console.log('Starting OCR processing for image:', imagePath);
    const worker = await createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    console.log('Tesseract worker initialized');
    
    const { data: { text } } = await worker.recognize(imagePath);
    console.log('Raw extracted text:', text);
    
    await worker.terminate();
    return text;
  } catch (error) {
    console.error('Error in extractTextFromImage:', error);
    throw new Error(`Failed to process image: ${error.message}`);
  }
};

const extractTextFromPDF = async (pdfPath) => {
  try {
    console.log('Starting PDF processing:', pdfPath);
    if (!fs.existsSync(pdfPath)) {
      throw new Error('PDF file not found');
    }
    
    const dataBuffer = fs.readFileSync(pdfPath);
    
    const options = {
      pagerender: async (pageData) => {
        try {
          const text = await pageData.getTextContent();
          return text.items.map(item => item.str).join(' ');
        } catch (err) {
          console.error('Error rendering PDF page:', err);
          return '';
        }
      }
    };

    const data = await pdfParse(dataBuffer, options);
    console.log('Raw extracted text from PDF:', data.text);
    return data.text;
  } catch (error) {
    console.error('Error in extractTextFromPDF:', error);
    throw new Error(`Failed to process PDF: ${error.message}`);
  }
};

const extractValue = (text, pattern, stopPattern = /(?=\s+(?:Date|Product|Warranty|SKU|Total|Quantity|Price))|$/) => {
  const fullPattern = new RegExp(pattern.source + stopPattern.source, pattern.flags);
  const match = text.match(fullPattern);
  return match ? match[1].trim() : '';
};

const extractFields = (text) => {
  try {
    console.log('Starting field extraction from text');
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text input');
    }

    // Normalize text: remove extra spaces and newlines
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    console.log('Normalized text:', normalizedText);

    const fields = {
      vendorName: '',
      productName: '',
      invoiceNumber: '',
      date: '',
      time: '',
      imeiSku: '',
      warrantyEndDate: ''
    };

    // Common field delimiters in the text
    const fieldDelimiter = /(?=\s+(?:Date|Product|Warranty|SKU|Total|Quantity|Price))/;

    // Extract vendor name (stop at Date & Time)
    fields.vendorName = extractValue(
      normalizedText,
      /(?:^|Vendor Name:\s*)([\w\s&.]+?Inc\.?)/i,
      /(?=\s+Date)/
    );

    // Extract product name (stop at Quantity)
    fields.productName = extractValue(
      normalizedText,
      /(?:Product Name:\s*)([\w\s-]+)/i,
      /(?=\s+Quantity)/
    );

    // Extract SKU (stop at Product Name or end)
    fields.imeiSku = extractValue(
      normalizedText,
      /SKU:\s*([\w-]+)/i,
      /(?=\s+Product Name)|$/
    );

    // Extract invoice number
    fields.invoiceNumber = extractValue(
      normalizedText,
      /Invoice Number:\s*(INV-\d+)/i,
      fieldDelimiter
    );

    // Extract date and time
    const dateTimeMatch = normalizedText.match(/Date & Time:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/i);
    if (dateTimeMatch) {
      fields.date = dateTimeMatch[1];
      fields.time = dateTimeMatch[2];
    }

    // Extract warranty end date (stop at Product Details)
    fields.warrantyEndDate = extractValue(
      normalizedText,
      /Warranty End Date:\s*(\d{4}-\d{2}-\d{2})/i,
      /(?=\s+Product Details)|$/
    );

    // Clean up any remaining whitespace and remove any trailing periods or spaces
    Object.keys(fields).forEach(key => {
      if (typeof fields[key] === 'string') {
        fields[key] = fields[key]
          .trim()
          .replace(/\.+$/, '')
          .replace(/\s+$/, '');
      }
    });

    console.log('Extracted fields:', fields);
    return fields;
  } catch (error) {
    console.error('Error in extractFields:', error);
    throw new Error(`Failed to extract fields: ${error.message}`);
  }
};

const processFile = async (filePath) => {
  try {
    console.log('Starting file processing:', filePath);
    
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    let text;
    const fileExt = path.extname(filePath).toLowerCase();
    
    if (fileExt === '.pdf') {
      text = await extractTextFromPDF(filePath);
    } else if (['.png', '.jpg', '.jpeg', '.tiff', '.bmp'].includes(fileExt)) {
      text = await extractTextFromImage(filePath);
    } else {
      throw new Error('Unsupported file format');
    }
    
    if (!text) {
      throw new Error('No text could be extracted from the file');
    }

    const extractedFields = extractFields(text);
    return extractedFields;
  } catch (error) {
    console.error('Error in processFile:', error);
    // Return empty fields instead of throwing error
    return {
      vendorName: '',
      productName: '',
      invoiceNumber: '',
      date: '',
      time: '',
      imeiSku: '',
      warrantyEndDate: ''
    };
  }
};

module.exports = {
  processFile
}; 