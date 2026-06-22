'use strict';

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 7001,
      socketTimeoutMS: 47001,
      // Connection pool — sized for 100+ concurrent submissions.
      maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE, 10) || 50,
      minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE, 10) || 5,
      maxConnecting: 10,
    });

    console.log(`MongoDB connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Reconnecting...');
    });
  } catch (err) {
    console.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
