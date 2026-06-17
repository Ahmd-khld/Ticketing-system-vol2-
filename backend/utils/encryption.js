const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // Must be 32 bytes

// Ensure key is exactly 32 bytes to prevent crypto errors
const getKey = () => {
  if (ENCRYPTION_KEY.length === 32) return Buffer.from(ENCRYPTION_KEY);
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}
const keyBuffer = getKey();

// --- Deterministic Encryption (for searchable fields like email) ---
const encryptDeterministic = (text) => {
  if (!text) return text;
  
  // Use HMAC-SHA256 for a much stronger deterministic IV (12 bytes for GCM)
  const iv = crypto.createHmac('sha256', keyBuffer).update(text).digest().subarray(0, 12);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Store IV + AuthTag + Encrypted data
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
};

const decryptDeterministic = (text) => {
  if (!text || !text.includes(':')) return text;
  
  try {
    const textParts = text.split(':');
    
    // Legacy Backwards Compatibility with AES-256-CBC
    // (Existing data in the DB will continue to decrypt perfectly)
    if (textParts.length === 2) {
      const iv = Buffer.from(textParts[0], 'hex');
      const encryptedText = Buffer.from(textParts[1], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    
    // Modern AES-256-GCM Decryption (Authenticated Encryption)
    if (textParts.length === 3) {
      const iv = Buffer.from(textParts[0], 'hex');
      const authTag = Buffer.from(textParts[1], 'hex');
      const encryptedText = Buffer.from(textParts[2], 'hex');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    
    return text; // Unknown format
  } catch (error) {
    return text; // Return original if decryption fails
  }
};

// --- Random IV Encryption (for non-searchable fields like phone, name) ---
const encryptRandom = (text) => {
  if (!text) return text;
  const iv = crypto.randomBytes(12); // 12 bytes is standard for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
};

const decryptRandom = (text) => {
  return decryptDeterministic(text); 
};

module.exports = {
  encryptDeterministic,
  decryptDeterministic,
  encryptRandom,
  decryptRandom,
};
