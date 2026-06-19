const { z } = require('zod');

const loginValidationSchema = z.object({
  body: z.object({
    email: z
      .string({
        invalid_type_error: 'Email must be a string',
      })
      .email('Invalid email format'),
    password: z
      .string({
        invalid_type_error: 'Password must be a string',
      })
      .min(5, 'Password must be at least 5 characters long'),
  }),
});

const ALLOWED_PROVIDERS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
if (process.env.NODE_ENV === 'test') {
  ALLOWED_PROVIDERS.push('example.com', 'test.com', 'smartpark.com');
}

const registerValidationSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email('Invalid email format')
      .refine((val) => {
        const domain = val.split('@')[1];
        return ALLOWED_PROVIDERS.includes(domain?.toLowerCase());
      }, {
        message: 'Email must be from a supported provider (gmail, yahoo, outlook, hotmail, icloud)'
      }),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
    phone: z
      .string()
      .length(11, 'Phone number must be exactly 11 digits')
      .regex(/^01[0125][0-9]{8}$/, 'Must be a valid Egyptian phone number')
  }).passthrough(),
});

const adminSearchSchema = z.object({
  query: z.object({
    type: z.string().optional(),
    search: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

// ---- Email change flow ------------------------------------------------------
const otpCodeSchema = z
  .string({ invalid_type_error: 'OTP must be a string' })
  .trim()
  .regex(/^\d{6}$/, 'OTP must be a 6-digit code');

// Phase 1a: initiate the change by re-entering the account password.
const initiateEmailChangeSchema = z.object({
  body: z.object({
    password: z
      .string({ invalid_type_error: 'Password must be a string' })
      .min(1, 'Password is required'),
  }),
});

// Phase 1b: verify the 2FA security code sent to the current email.
const verifyCurrentEmailSchema = z.object({
  body: z.object({
    otp: otpCodeSchema,
  }),
});

// Phase 3a: submit the new email (token may also arrive via x-email-change-token header).
const setNewEmailSchema = z.object({
  body: z.object({
    newEmail: z.string().trim().toLowerCase().email('Invalid email format'),
    token: z.string().min(1).optional(),
  }),
});

// Phase 3b: verify the new-email OTP.
const verifyNewEmailSchema = z.object({
  body: z.object({
    otp: otpCodeSchema,
    token: z.string().min(1).optional(),
  }),
});

module.exports = {
  loginValidationSchema,
  registerValidationSchema,
  adminSearchSchema,
  initiateEmailChangeSchema,
  verifyCurrentEmailSchema,
  setNewEmailSchema,
  verifyNewEmailSchema,
};
