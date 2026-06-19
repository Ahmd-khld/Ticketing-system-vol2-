const ErrorLog = require('../models/ErrorLog');

const errorHandler = async (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  // Handle Mongoose duplicate key errors
  if (err.name === 'MongoServerError' && err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0];
    message = `Duplicate field value entered${field ? ` for ${field}` : ''}`;
  } else if (
    err.message.includes('Not authorized') || 
    err.message.includes('token failed') || 
    err.message.includes('jwt')
  ) {
    statusCode = 401;
  }

  const errorMetadata = {
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    user: req.user ? req.user.id : null,
    ip: req.ip,
    name: err.name,
    code: err.code,
    keyValue: err.keyValue
  };

  try {
    await ErrorLog.create({
      message: message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
      metadata: errorMetadata,
    });
  } catch (logError) {
    console.error('Failed to log error to DB', logError);
  }

  res.status(statusCode).json({ message: message });
};

module.exports = { errorHandler };
