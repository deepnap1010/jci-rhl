// ============================================================
//  DATABASE CONNECTION
//  One place to connect to MongoDB. To switch from local Mongo
//  to Atlas (cloud) later, you only change MONGO_URI in .env.
// ============================================================
import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is missing in .env');
  }
  await mongoose.connect(uri);
  console.log('✅ MongoDB connected');
}
