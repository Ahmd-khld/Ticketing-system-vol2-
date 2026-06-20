const mongoose = require('mongoose');
const dbHandler = require('./setup');
const User = require('../models/User');
const bcrypt = require('bcrypt');

beforeAll(async () => await dbHandler.connect());
afterEach(async () => await dbHandler.clearDatabase());
afterAll(async () => await dbHandler.closeDatabase());

describe('User Model Hooks', () => {
  it('should validate role correctly', async () => {
    let err;
    try {
      await User.create({
        name: 'Test',
        email: 'test@example.com',
        password: 'password',
        role: 'invalid_role'
      });
    } catch (error) {
      err = error;
    }
    expect(err).toBeDefined();
    expect(err.errors.role.message).toBe('Invalid role assigned.');
  });

  it('pre findOneAndUpdate should hash password', async () => {
    const user = await User.create({
      name: 'Test',
      email: 'test2@example.com',
      password: 'password123'
    });

    await User.findOneAndUpdate(
      { email: 'test2@example.com' },
      { password: 'newpassword' }
    );

    const updatedUser = await User.findOne({ email: 'test2@example.com' });
    const isMatch = await bcrypt.compare('newpassword', updatedUser.password);
    expect(isMatch).toBe(true);

    // Test $set syntax
    await User.findOneAndUpdate(
      { email: 'test2@example.com' },
      { $set: { password: 'setpassword' } }
    );
    const updatedUser2 = await User.findOne({ email: 'test2@example.com' });
    const isMatch2 = await bcrypt.compare('setpassword', updatedUser2.password);
    expect(isMatch2).toBe(true);
  });

  it('pre updateMany should hash password', async () => {
    await User.create({
      name: 'Test',
      email: 'test3@example.com',
      password: 'password123'
    });

    await User.updateMany(
      { email: 'test3@example.com' },
      { password: 'newpassword' }
    );

    const updatedUser = await User.findOne({ email: 'test3@example.com' });
    const isMatch = await bcrypt.compare('newpassword', updatedUser.password);
    expect(isMatch).toBe(true);

    await User.updateMany(
      { email: 'test3@example.com' },
      { $set: { password: 'setpassword' } }
    );

    const updatedUser2 = await User.findOne({ email: 'test3@example.com' });
    const isMatch2 = await bcrypt.compare('setpassword', updatedUser2.password);
    expect(isMatch2).toBe(true);
  });

  it('pre updateOne should hash password', async () => {
    await User.create({
      name: 'Test',
      email: 'test4@example.com',
      password: 'password123'
    });

    await User.updateOne(
      { email: 'test4@example.com' },
      { password: 'newpassword' }
    );

    const updatedUser = await User.findOne({ email: 'test4@example.com' });
    const isMatch = await bcrypt.compare('newpassword', updatedUser.password);
    expect(isMatch).toBe(true);

    await User.updateOne(
      { email: 'test4@example.com' },
      { $set: { password: 'setpassword' } }
    );

    const updatedUser2 = await User.findOne({ email: 'test4@example.com' });
    const isMatch2 = await bcrypt.compare('setpassword', updatedUser2.password);
    expect(isMatch2).toBe(true);
  });
});
