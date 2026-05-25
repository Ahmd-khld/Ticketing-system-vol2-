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

const registerValidationSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
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

module.exports = {
  loginValidationSchema,
  registerValidationSchema,
  adminSearchSchema,
};
