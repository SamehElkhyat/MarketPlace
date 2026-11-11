import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { connectDb } from '../config/db';

/** Liveness + dependency check used by uptime monitors and the deploy pipeline. */
export const health: RequestHandler = async (_req, res) => {
  let db: 'up' | 'down' = 'down';
  try {
    await connectDb();
    await mongoose.connection.db?.admin().ping();
    db = 'up';
  } catch {
    // reported below
  }
  res.status(db === 'up' ? 200 : 503).json({
    status: db === 'up' ? 'ok' : 'degraded',
    db,
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
};
