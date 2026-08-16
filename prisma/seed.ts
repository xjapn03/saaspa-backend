import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@sandrapinzonsaludybelleza.com.co' },
    update: { passwordHash },
    create: {
      email: 'admin@sandrapinzonsaludybelleza.com.co',
      passwordHash,
      firstName: 'Admin',
      lastName: 'Kamerinos',
      phone: '3000000000',
      role: 'ADMIN',
      description: 'Administrador del sistema Kamerinos SPA',
    },
  });

  const categories = await Promise.all([
    prisma.category.upsert({ where: { slug: 'masajes' }, update: {}, create: { name: 'Masajes', slug: 'masajes', description: 'Masajes relajantes y terapéuticos', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'faciales' }, update: {}, create: { name: 'Faciales', slug: 'faciales', description: 'Tratamientos faciales profesionales', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'unas' }, update: {}, create: { name: 'Uñas', slug: 'unas', description: 'Manicure y pedicure', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'depilacion' }, update: {}, create: { name: 'Depilación', slug: 'depilacion', description: 'Depilación profesional con cera', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'corporal' }, update: {}, create: { name: 'Corporal', slug: 'corporal', description: 'Tratamientos corporales y reductores', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'cremas' }, update: {}, create: { name: 'Cremas', slug: 'cremas', description: 'Cremas hidratantes y nutritivas', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'serums' }, update: {}, create: { name: 'Sérums', slug: 'serums', description: 'Sérums concentrados para el cuidado de la piel', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'mascarillas' }, update: {}, create: { name: 'Mascarillas', slug: 'mascarillas', description: 'Mascarillas faciales y corporales', isActive: true } }),
  ]);

  const catMap: Record<string, string> = {};
  categories.forEach((c) => { catMap[c.slug] = c.id; });

  const slugify = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const services = [
    { name: 'Masaje Relajante', description: 'Masaje corporal completo de 60 minutos con aceites esenciales.', price: 120000, compareAtPrice: 150000, duration: 60, categoryId: catMap.masajes, isFeatured: true },
    { name: 'Masaje Deportivo', description: 'Masaje profundo para aliviar tensión muscular y mejorar la recuperación.', price: 140000, compareAtPrice: null, duration: 75, categoryId: catMap.masajes, isFeatured: true },
    { name: 'Limpieza Facial Profunda', description: 'Limpieza facial con extracción y mascarilla hidratante.', price: 85000, compareAtPrice: 110000, duration: 45, categoryId: catMap.faciales, isFeatured: false },
    { name: 'Hidratación Facial Premium', description: 'Tratamiento intensivo con ácido hialurónico y vitamina C.', price: 110000, compareAtPrice: null, duration: 60, categoryId: catMap.faciales, isFeatured: true },
    { name: 'Manicure Semi-permanente', description: 'Aplicación de esmalte semi-permanente con preparación completa.', price: 55000, compareAtPrice: 70000, duration: 60, categoryId: catMap.unas, isFeatured: false },
    { name: 'Pedicure Spa', description: 'Pedicure completo con exfoliación, hidratación y esmaltado.', price: 65000, compareAtPrice: null, duration: 50, categoryId: catMap.unas, isFeatured: false },
    { name: 'Depilación con Cera Piernas', description: 'Depilación completa de piernas con cera tibia.', price: 70000, compareAtPrice: null, duration: 30, categoryId: catMap.depilacion, isFeatured: true },
    { name: 'Depilación Axilas + Brazos', description: 'Depilación completa de axilas y brazos.', price: 45000, compareAtPrice: 60000, duration: 25, categoryId: catMap.depilacion, isFeatured: false },
  ];

  for (const s of services) {
    await prisma.service.upsert({
      where: { id: 'seed-' + s.name.toLowerCase().replace(/\s+/g, '-') },
      update: { price: s.price, compareAtPrice: s.compareAtPrice, categoryId: s.categoryId, slug: slugify(s.name), isFeatured: s.isFeatured },
      create: { id: 'seed-' + s.name.toLowerCase().replace(/\s+/g, '-'), ...s, slug: slugify(s.name), mainImage: null, carouselImages: [] },
    });
  }

  const products = [
    { name: 'Crema Hidratante Facial', slug: 'crema-hidratante-facial', description: 'Crema ligera con ácido hialurónico para hidratación diaria.', price: 85000, compareAtPrice: 110000, stock: 25, sku: 'SKU-CHF-001', sponsor: 'Loreal', mainImage: null, isActive: true, isFeatured: true, categoryId: catMap.cremas },
    { name: 'Crema Corporal Nutritiva', slug: 'crema-corporal-nutritiva', description: 'Crema corporal con manteca de karité y vitamina E.', price: 95000, compareAtPrice: null, stock: 15, sku: 'SKU-CCN-002', sponsor: 'Natura', mainImage: null, isActive: true, isFeatured: true, categoryId: catMap.cremas },
    { name: 'Sérum Revitalizante', slug: 'serum-revitalizante', description: 'Sérum concentrado con vitamina C y antioxidantes.', price: 120000, compareAtPrice: 150000, stock: 10, sku: 'SKU-SR-003', sponsor: 'Vichy', mainImage: null, isActive: true, isFeatured: true, categoryId: catMap.serums },
    { name: 'Sérum Anti-edad', slug: 'serum-anti-edad', description: 'Sérum con retinol y colágeno para reducir líneas de expresión.', price: 135000, compareAtPrice: null, stock: 8, sku: 'SKU-SA-004', sponsor: 'La Roche-Posay', mainImage: null, isActive: true, isFeatured: false, categoryId: catMap.serums },
    { name: 'Mascarilla Purificante', slug: 'mascarilla-purificante', description: 'Mascarilla de arcilla verde para purificar y desintoxicar la piel.', price: 45000, compareAtPrice: 55000, stock: 30, sku: 'SKU-MP-005', sponsor: 'Garnier', mainImage: null, isActive: true, isFeatured: false, categoryId: catMap.mascarillas },
    { name: 'Mascarilla Hidratante Nocturna', slug: 'mascarilla-hidratante-nocturna', description: 'Mascarilla intensiva para usar durante la noche.', price: 55000, compareAtPrice: null, stock: 20, sku: 'SKU-MHN-006', sponsor: 'Ponds', mainImage: null, isActive: true, isFeatured: false, categoryId: catMap.mascarillas },
    { name: 'Aceite Corporal Relajante', slug: 'aceite-corporal-relajante', description: 'Aceite con lavanda y almendras para masajes relajantes.', price: 65000, compareAtPrice: null, stock: 12, sku: 'SKU-ACR-007', sponsor: 'Kamerinos', mainImage: null, isActive: true, isFeatured: true, categoryId: catMap.corporal },
    { name: 'Exfoliante Corporal', slug: 'exfoliante-corporal', description: 'Exfoliante con granos de café y coco para una piel suave.', price: 75000, compareAtPrice: 90000, stock: 18, sku: 'SKU-EC-008', sponsor: 'Kamerinos', mainImage: null, isActive: true, isFeatured: false, categoryId: catMap.corporal },
  ];

  let productsCreated = 0;
  for (const p of products) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: { price: p.price, stock: p.stock, isActive: p.isActive },
      create: p,
    });
    productsCreated++;
  }

  // Los banners de campaña (modelo Banner, posición HERO/STRIP) NO se siembran
  // aquí porque requieren imágenes reales subidas por el admin
  // (/dashboard/banners → POST /api/upload?folder=banners). El home solo
  // muestra banners activos; si no hay, la página se ve limpia.

  console.log(`Seed ejecutado: admin=${admin.email}, categorías=${categories.length}, servicios=${services.length}, productos=${productsCreated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
