const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app } = require('../app');
const dbHandler = require('./setup');
const User = require('../models/User');

// Email sending is a no-op in tests.
jest.mock('../utils/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ status: 'success' }),
}));

// OTPs are stored hashed, so a test can't read the real code. Pin generation to a
// known value; hashOtp/verifyOtp stay real, so hashing + comparison are exercised.
jest.mock('../utils/otpService', () => {
  const actual = jest.requireActual('../utils/otpService');
  return { ...actual, generateOtp: jest.fn(() => '123456') };
});

beforeAll(async () => await dbHandler.connect());
afterEach(async () => await dbHandler.clearDatabase());
afterAll(async () => await dbHandler.closeDatabase());

const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });

const createUser = async (overrides = {}) =>
  User.create({
    name: 'Test User',
    email: 'current@test.com',
    password: 'Password123!',
    isVerified: true,
    ...overrides,
  });

describe('Secure email-change flow', () => {
  let user;
  let auth;

  beforeEach(async () => {
    user = await createUser();
    auth = `Bearer ${tokenFor(user._id)}`;
  });

  const initiate = (password) =>
    request(app).post('/api/users/email-change/initiate').set('Authorization', auth).send({ password });
  const verify2fa = (otp) =>
    request(app).post('/api/users/email-change/verify-2fa').set('Authorization', auth).send({ otp });
  const setNewEmail = (newEmail, token) =>
    request(app).post('/api/users/email-change/set-new-email').set('Authorization', auth).send({ newEmail, token });
  const verifyNew = (otp, token) =>
    request(app).post('/api/users/email-change/verify-new').set('Authorization', auth).send({ otp, token });

  it('completes the full happy path: password -> 2FA -> dup check -> new code -> commit', async () => {
    expect((await initiate('Password123!')).statusCode).toEqual(200);

    const v2fa = await verify2fa('123456');
    expect(v2fa.statusCode).toEqual(200);
    expect(v2fa.body).toHaveProperty('token');
    const tempToken = v2fa.body.token;

    expect((await setNewEmail('new@test.com', tempToken)).statusCode).toEqual(200);

    const done = await verifyNew('123456', tempToken);
    expect(done.statusCode).toEqual(200);
    expect(done.body.email).toEqual('new@test.com');

    const updated = await User.findById(user._id);
    expect(updated.email).toEqual('new@test.com');
    expect(updated.tokenVersion).toEqual(user.tokenVersion + 1); // sessions invalidated
  });

  it('rejects initiation with the wrong password (no code sent)', async () => {
    const res = await initiate('WrongPassword!');
    expect(res.statusCode).toEqual(400);
  });

  it('rejects an invalid 2FA code', async () => {
    await initiate('Password123!');
    const res = await verify2fa('000000');
    expect(res.statusCode).toEqual(400);
  });

  it('blocks phase 3 without a valid temp token', async () => {
    await initiate('Password123!');
    await verify2fa('123456');
    const res = await setNewEmail('new@test.com', 'not-a-real-token');
    expect(res.statusCode).toEqual(400);
  });

  it('rejects a new email already used by another account', async () => {
    await createUser({ email: 'taken@test.com' });
    await initiate('Password123!');
    const tempToken = (await verify2fa('123456')).body.token;
    const res = await setNewEmail('taken@test.com', tempToken);
    expect(res.statusCode).toEqual(409);
  });

  it('does not allow changing email via the plain profile endpoint', async () => {
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', auth)
      .send({ email: 'sneaky@test.com' });
    expect(res.statusCode).toEqual(400);

    const updated = await User.findById(user._id);
    expect(updated.email).toEqual('current@test.com');
  });

  it('treats name and phone as immutable on the profile endpoint', async () => {
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', auth)
      .send({ name: 'Hacked Name', phone: '0000000000', hasDisability: true });
    expect(res.statusCode).toEqual(200);

    const updated = await User.findById(user._id);
    expect(updated.name).toEqual('Test User'); // unchanged
    expect(updated.phone).toBeFalsy(); // unchanged (never set)
    expect(updated.hasDisability).toEqual(true); // accessibility is still updatable
  });
});
