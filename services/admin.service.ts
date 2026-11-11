import { AuditLogModel } from '../models/AuditLog';
import { InventoryLogModel } from '../models/InventoryLog';
import { OrderModel, type OrderAttrs } from '../models/Order';
import { SessionModel } from '../models/Session';
import { UserModel } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { toOrderDto } from '../utils/orderDto';
import { escapeRegex } from '../utils/text';
import { toPage, type PaginationQuery } from '../validators/common.validators';

type OrderRow = OrderAttrs & { _id: unknown };

const page = (p: PaginationQuery) => ({ skip: (p.page - 1) * p.limit, limit: p.limit });

/** Back-office queries (orders, customers, inventory history, audit log). */
export const adminService = {
  // ── orders ─────────────────────────────────────────────────────────────────
  async listOrders(
    query: PaginationQuery & {
      status?: string | undefined;
      paymentMethod?: string | undefined;
      q?: string | undefined;
      from?: Date | undefined;
      to?: Date | undefined;
    },
  ) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter['status'] = query.status;
    if (query.paymentMethod) filter['paymentMethod'] = query.paymentMethod;
    if (query.from || query.to) {
      filter['createdAt'] = { ...(query.from && { $gte: query.from }), ...(query.to && { $lte: query.to }) };
    }
    if (query.q) {
      const prefix = new RegExp(`^${escapeRegex(query.q)}`, 'i');
      filter['$or'] = [{ orderNumber: prefix }, { customerEmail: prefix }, { 'shippingAddress.phone': prefix }];
    }
    const { skip, limit } = page(query);
    const [items, total] = await Promise.all([
      OrderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      OrderModel.countDocuments(filter),
    ]);
    return toPage(items.map((o) => toOrderDto(o as OrderRow, 'admin', { includeCustomer: true })), total, query);
  },

  /** Cheap counter the dashboard polls every 30 s (Vercel Functions have no WebSockets). */
  async newOrdersCount(since?: Date) {
    const [pending, newSince] = await Promise.all([
      OrderModel.countDocuments({ status: { $in: ['pending_confirmation', 'paid'] } }),
      since ? OrderModel.countDocuments({ createdAt: { $gt: since } }) : Promise.resolve(0),
    ]);
    return { pending, newSince, serverTime: new Date() };
  },

  async getOrder(id: string) {
    const order = await OrderModel.findById(id).lean();
    if (!order) throw ApiError.notFound('Order');
    return toOrderDto(order, 'admin', { includeCustomer: true });
  },

  // ── inventory ──────────────────────────────────────────────────────────────
  async inventoryLogs(query: PaginationQuery & { sku?: string | undefined }) {
    const filter = query.sku ? { sku: query.sku } : {};
    const { skip, limit } = page(query);
    const [items, total] = await Promise.all([
      InventoryLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      InventoryLogModel.countDocuments(filter),
    ]);
    return toPage(items, total, query);
  },

  // ── customers ──────────────────────────────────────────────────────────────
  async listCustomers(query: PaginationQuery & { q?: string | undefined }) {
    const filter: Record<string, unknown> = { role: 'customer' };
    if (query.q) {
      const prefix = new RegExp(`^${escapeRegex(query.q)}`, 'i');
      filter['$or'] = [{ email: prefix }, { name: prefix }];
    }
    const { skip, limit } = page(query);
    const [users, total] = await Promise.all([
      UserModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      UserModel.countDocuments(filter),
    ]);
    const stats = await OrderModel.aggregate<{ _id: unknown; orders: number; spent: number }>([
      {
        $match: {
          userId: { $in: users.map((u) => u._id) },
          status: { $nin: ['cancelled', 'refunded', 'pending_payment'] },
        },
      },
      { $group: { _id: '$userId', orders: { $sum: 1 }, spent: { $sum: '$total' } } },
    ]);
    const byUser = new Map(stats.map((s) => [String(s._id), s]));
    return toPage(
      users.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        status: u.status,
        emailVerified: u.emailVerified,
        createdAt: u.createdAt,
        orders: byUser.get(String(u._id))?.orders ?? 0,
        totalSpent: byUser.get(String(u._id))?.spent ?? 0,
      })),
      total,
      query,
    );
  },

  async getCustomer(id: string) {
    const user = await UserModel.findOne({ _id: id, role: 'customer' }).lean();
    if (!user) throw ApiError.notFound('Customer');
    const orders = await OrderModel.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean();
    return {
      customer: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        status: user.status,
        emailVerified: user.emailVerified,
        addresses: user.addresses,
        createdAt: user.createdAt,
      },
      orders: orders.map((o) => toOrderDto(o, 'admin')),
    };
  },

  /** Banning also revokes every refresh token, so the customer is signed out of all devices immediately. */
  async setCustomerStatus(id: string, status: 'active' | 'banned') {
    const user = await UserModel.findOneAndUpdate({ _id: id, role: 'customer' }, { $set: { status } }, { returnDocument: 'after' });
    if (!user) throw ApiError.notFound('Customer');
    if (status === 'banned') {
      await SessionModel.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    }
    return { id, status: user.status };
  },

  // ── audit log ──────────────────────────────────────────────────────────────
  async auditLogs(query: PaginationQuery) {
    const { skip, limit } = page(query);
    const [items, total] = await Promise.all([
      AuditLogModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actorId', 'name email').lean(),
      AuditLogModel.countDocuments(),
    ]);
    return toPage(items, total, query);
  },
};
