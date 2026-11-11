import { model, Schema } from 'mongoose';

interface CounterAttrs {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<CounterAttrs>({ _id: String, seq: { type: Number, default: 0 } });
const CounterModel = model<CounterAttrs>('Counter', counterSchema);

/** Atomic, gap-tolerant sequence generator (used for human-friendly order numbers). */
export async function nextSequence(name: string): Promise<number> {
  const doc = await CounterModel.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  return doc.seq;
}

/** Moves a sequence forward so it never hands out a number that already exists (e.g. after seeding or imports). */
export async function ensureSequenceAtLeast(name: string, value: number): Promise<void> {
  await CounterModel.updateOne({ _id: name }, { $max: { seq: value } }, { upsert: true });
}
