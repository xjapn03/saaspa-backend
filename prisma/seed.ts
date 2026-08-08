import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@kamerinosspa.com' },
    update: { passwordHash },
    create: {
      email: 'admin@kamerinosspa.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'Kamerinos',
      phone: '3000000000',
      role: 'ADMIN',
      description: 'Administrador del sistema Kamerinos SPA',
    },
  });

  const services = [
    {
      name: 'Masaje Relajante',
      description: 'Masaje corporal completo de 60 minutos con aceites esenciales.',
      price: 120000,
      duration: 60,
      category: 'Masajes',
    },
    {
      name: 'Limpieza Facial Profunda',
      description: 'Limpieza facial con extracción y mascarilla hidratante.',
      price: 85000,
      duration: 45,
      category: 'Faciales',
    },
    {
      name: 'Manicure Semi-permanente',
      description: 'Aplicación de esmalte semi-permanente con preparación completa.',
      price: 55000,
      duration: 60,
      category: 'Uñas',
    },
    {
      name: 'Depilación con Cera',
      description: 'Depilación completa de piernas con cera tibia.',
      price: 70000,
      duration: 30,
      category: 'Depilación',
    },
  ];

  for (const s of services) {
    await prisma.service.create({ data: s });
  }

  console.log(`Seed ejecutado: admin=${admin.email}, servicios=${services.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
