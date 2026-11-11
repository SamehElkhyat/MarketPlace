import type { RequestHandler } from 'express';
import { currentUserId } from '../middleware/auth.middleware';
import { validated } from '../middleware/validate.middleware';
import { adminService } from '../services/admin.service';
import { recordAudit } from '../services/audit.service';
import { dashboardService } from '../services/dashboard.service';
import { inventoryService } from '../services/inventory.service';
import { transitionOrder } from '../services/orderTransitions.service';
import { signImageUpload } from '../services/upload.service';
import { toOrderDto } from '../utils/orderDto';
import type {
  adjustStockSchemas,
  adminListOrdersSchemas,
  adminOrderIdSchemas,
  auditLogsSchemas,
  customerIdSchemas,
  customerStatusSchemas,
  inventoryLogsSchemas,
  listCustomersSchemas,
  newOrdersSchemas,
  transitionOrderSchemas,
} from '../validators/admin.validators';

export const getDashboard: RequestHandler = async (_req, res) => {
  res.json(await dashboardService.overview());
};

// ── orders ───────────────────────────────────────────────────────────────────
export const listOrders: RequestHandler = async (req, res) => {
  const { query } = validated<typeof adminListOrdersSchemas>(req);
  res.json(await adminService.listOrders(query));
};

export const getNewOrdersCount: RequestHandler = async (req, res) => {
  const { query } = validated<typeof newOrdersSchemas>(req);
  res.json(await adminService.newOrdersCount(query.since));
};

export const getOrder: RequestHandler = async (req, res) => {
  const { params } = validated<typeof adminOrderIdSchemas>(req);
  res.json({ order: await adminService.getOrder(params.id) });
};

/** Moves an order along its lifecycle — the state machine rejects any illegal move, even from an admin. */
export const transition: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof transitionOrderSchemas>(req);
  const order = await transitionOrder({
    orderId: params.id,
    to: body.to,
    actor: 'admin',
    byUserId: currentUserId(req),
    ...(body.note ? { note: body.note } : {}),
  });
  await recordAudit(req, { action: 'order.transition', entity: 'order', entityId: params.id, meta: { to: body.to, note: body.note } });
  res.json({ order: toOrderDto(order, 'admin', { includeCustomer: true }) });
};

// ── inventory ────────────────────────────────────────────────────────────────
export const adjustStock: RequestHandler = async (req, res) => {
  const { body } = validated<typeof adjustStockSchemas>(req);
  const result = await inventoryService.adjust({ ...body, byUserId: currentUserId(req) });
  await recordAudit(req, { action: 'inventory.adjust', entity: 'sku', entityId: body.sku, meta: { delta: body.delta, note: body.note } });
  res.json(result);
};

export const getInventoryLogs: RequestHandler = async (req, res) => {
  const { query } = validated<typeof inventoryLogsSchemas>(req);
  res.json(await adminService.inventoryLogs(query));
};

// ── customers ────────────────────────────────────────────────────────────────
export const listCustomers: RequestHandler = async (req, res) => {
  const { query } = validated<typeof listCustomersSchemas>(req);
  res.json(await adminService.listCustomers(query));
};

export const getCustomer: RequestHandler = async (req, res) => {
  const { params } = validated<typeof customerIdSchemas>(req);
  res.json(await adminService.getCustomer(params.id));
};

export const setCustomerStatus: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof customerStatusSchemas>(req);
  const result = await adminService.setCustomerStatus(params.id, body.status);
  await recordAudit(req, { action: `customer.${body.status === 'banned' ? 'ban' : 'unban'}`, entity: 'user', entityId: params.id });
  res.json(result);
};

// ── audit log & uploads ──────────────────────────────────────────────────────
export const getAuditLogs: RequestHandler = async (req, res) => {
  const { query } = validated<typeof auditLogsSchemas>(req);
  res.json(await adminService.auditLogs(query));
};

export const signUpload: RequestHandler = (_req, res) => {
  res.json(signImageUpload());
};
