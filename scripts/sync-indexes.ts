import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db';
import '../routes/index'; // importing the routers loads every model

/**
 * Production never auto-builds indexes (`autoIndex` is off so cold starts stay fast), yet correctness depends on
 * them: unique SKUs, unique (userId, idempotencyKey), unique order numbers, TTL on sessions…
 * Run this ONCE per environment (and after schema index changes):  npm run indexes
 */
await connectDb();
for (const name of mongoose.modelNames()) {
  await mongoose.model(name).createIndexes();
  console.log(`✔ indexes ready: ${name}`);
}
await disconnectDb();
