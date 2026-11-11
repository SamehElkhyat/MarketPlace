import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Docker-free local database: an in-memory single-node REPLICA SET (needed for transactions).
 * Data disappears when the process stops — use `docker compose up` for persistent local data.
 *
 *   npm run dev:db
 *   MONGODB_URI=mongodb://127.0.0.1:27018/?replicaSet=rs0 npm run dev
 */
const port = Number(process.env['DEV_DB_PORT'] ?? 27018);
const replSet = await MongoMemoryReplSet.create({ replSet: { name: 'rs0', count: 1 }, instanceOpts: [{ port }] });

console.log(`\nIn-memory MongoDB replica set ready:\n  ${replSet.getUri('marketplace')}\n\nPress Ctrl+C to stop.\n`);
const stop = async () => {
  await replSet.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
