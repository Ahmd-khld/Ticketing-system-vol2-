const validateRequest = (schema) => async (req, res, next) => {
  try {
    const validatedData = await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    // Safely update req.body (standard practice in Express)
    if (validatedData.body) {
      req.body = validatedData.body;
    }

    // Modern Express (especially v5) protects req.query and req.params with getters.
    // Instead of reassigning them (which causes "only a getter" errors), 
    // we mutate the existing objects to preserve type coercion/trimming from Zod.
    
    if (validatedData.query) {
      Object.keys(req.query).forEach(key => delete req.query[key]);
      Object.assign(req.query, validatedData.query);
    }

    if (validatedData.params) {
      // params are usually read-only in many environments, so we use a safe merge
      try {
        Object.assign(req.params, validatedData.params);
      } catch (e) {
        // Fallback: if params are truly immutable, we skip the update
        // but since validation passed, the original values are already safe.
      }
    }

    return next();
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid input data',
      errors: error.errors ? error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      })) : [{ message: error.message }],
    });
  }
};

module.exports = validateRequest;
