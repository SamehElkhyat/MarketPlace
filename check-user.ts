import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

async function resetAdmin() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/marketplace?replicaSet=rs0&directConnection=true';
    await mongoose.connect(mongoUri);
    console.log('📦 Connected to MongoDB');

    // توليد هاش جديد وصحيح تماماً لكلمة المرور Admin#12345
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash('Admin#12345', salt);

    // تحديث أو إنشاء مستخدم الأدمن
    const result = await mongoose.connection.collection('users').updateOne(
      { email: 'admin@atelier.test' },
      {
        $set: {
          name: 'Store Admin',
          passwordHash: passwordHash,
          role: 'admin',
          status: 'active',
          emailVerified: true,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date(),
          wishlist: [],
          addresses: [],
          locale: 'ar'
        }
      },
      { upsert: true }
    );

    console.log('✅ Admin user successfully reset/created in DB:', result);
  } catch (err) {
    console.error('❌ Error resetting admin:', err);
  } finally {
    await mongoose.disconnect();
  }
}

resetAdmin();