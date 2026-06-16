const jwt = require('jsonwebtoken');

/**
 * Short-lived, purpose-scoped token that authorizes a user to move from
 * "current email verified" (phase 1) to "set & verify new email" (phase 3).
 *
 * SECURITY: this token is signed with a secret DISTINCT from JWT_SECRET. That is
 * deliberate — the normal `protect` middleware verifies session tokens with
 * JWT_SECRET and skips the tokenVersion check when no `v` claim is present, so a
 * token signed with JWT_SECRET could otherwise be replayed as a full session.
 * Using a separate secret makes this token unusable on any normal protected route.
 */

const PURPOSE = 'email-change';

const getSecret = () => {
  const dedicated = (process.env.EMAIL_CHANGE_SECRET || '').trim();
  if (dedicated) return dedicated;
  // Derive a distinct secret so it can never be verified with JWT_SECRET as-is.
  const base = (process.env.JWT_SECRET || '').trim();
  return base ? `${base}|${PURPOSE}` : '';
};

const signEmailChangeToken = (userId, requestId, jti) =>
  jwt.sign(
    { id: String(userId), rid: String(requestId), jti, purpose: PURPOSE },
    getSecret(),
    { expiresIn: '10m' }
  );

// Express middleware: must run AFTER `protect` so req.user is populated.
const requireEmailChangeToken = (req, res, next) => {
  const token =
    (req.body && req.body.token) ||
    (req.headers['x-email-change-token'] || '').toString().trim();

  if (!token) {
    return res.status(401).json({ message: 'Missing email-change authorization token.' });
  }

  const secret = getSecret();
  if (!secret) {
    console.error('[EmailChange] No signing secret configured.');
    return res.status(500).json({ message: 'Server configuration error.' });
  }

  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.purpose !== PURPOSE) {
      return res.status(401).json({ message: 'Invalid token purpose.' });
    }
    // The authenticated session must own the temp token.
    if (req.user && String(req.user._id) !== String(decoded.id)) {
      return res.status(403).json({ message: 'Token does not belong to the authenticated user.' });
    }
    req.emailChange = { userId: decoded.id, requestId: decoded.rid, jti: decoded.jti };
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired email-change token.' });
  }
};

module.exports = { signEmailChangeToken, requireEmailChangeToken, PURPOSE };
