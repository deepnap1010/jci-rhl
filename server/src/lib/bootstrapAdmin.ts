// ============================================================
//  BOOTSTRAP SUPER ADMIN
//
//  On startup, make sure exactly one Super Admin login exists so
//  someone can get in and create the other users. The credentials
//  come from .env:
//      SUPER_ADMIN_EMAIL
//      SUPER_ADMIN_PASSWORD
//      SUPER_ADMIN_NAME     (optional)
//
//  If a superAdmin already exists we leave it alone (we never
//  reset its password on restart). Unlike created users, the
//  bootstrap admin is NOT forced to change its password.
// ============================================================
import { UserModel } from '../models/User';

export async function bootstrapSuperAdmin(): Promise<void> {
  const email = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.SUPER_ADMIN_PASSWORD || '';
  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    console.warn('⚠️  SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set in .env — no bootstrap admin created.');
    return;
  }

  const existing = await UserModel.findOne({ role: 'superAdmin' });
  if (existing) {
    console.log(`👑 Super Admin already exists (${existing.get('email')}).`);
    return;
  }

  const user = new UserModel({
    name,
    email,
    role: 'superAdmin',
    mustChangePassword: true, // the bootstrap admin sets its own password via .env
    isActive: true,
  });
  await (user as any).setPassword(password);
  await user.save();

  console.log('👑 Bootstrapped Super Admin login:');
  console.log(`     email    : ${email}`);
  console.log(`     password : (from SUPER_ADMIN_PASSWORD in .env)`);
}
