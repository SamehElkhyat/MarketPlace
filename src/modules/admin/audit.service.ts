import type { Request } from 'express';
import { toObjectId } from '../../lib/object-id';
import { logger } from '../../lib/logger';
import { AuditLogModel } from './audit-log.model';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}

/** "Who did what, when" — written for every mutating admin action. Never blocks the request on failure. */
export async function recordAudit(req: Request, entry: AuditEntry): Promise<void> {
  if (!req.auth) return;
  try {
    await AuditLogModel.create({
      actorId: toObjectId(req.auth.userId),
      ...entry,
      ...(req.ip ? { ip: req.ip } : {}),
    });
  } catch (error) {
    logger.error({ err: error, entry }, 'failed to write audit log');
  }
}
