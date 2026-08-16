import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Slugs del catálogo placeholder anterior (se eliminan al reseedear para
// dejar solo el catálogo real de la empresa).
const OLD_PRODUCT_SLUGS = [
  'crema-hidratante-facial',
  'crema-corporal-nutritiva',
  'serum-revitalizante',
  'serum-anti-edad',
  'mascarilla-purificante',
  'mascarilla-hidratante-nocturna',
  'aceite-corporal-relajante',
  'exfoliante-corporal',
];

const OLD_SERVICE_SLUGS = [
  'masaje-relajante',
  'masaje-deportivo',
  'limpieza-facial-profunda',
  'hidratacion-facial-premium',
  'manicure-semi-permanente',
  'pedicure-spa',
  'depilacion-con-cera-piernas',
  'depilacion-axilas-brazos',
];

const OLD_CATEGORY_SLUGS = [
  'masajes',
  'faciales',
  'unas',
  'depilacion',
  'corporal',
  'cremas',
  'serums',
  'mascarillas',
];

async function main() {
  const passwordHash = await bcrypt.hash('admin123$', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@sandrapinzonsaludybelleza.com.co' },
    update: { passwordHash, emailVerified: true },
    create: {
      email: 'admin@sandrapinzonsaludybelleza.com.co',
      passwordHash,
      firstName: 'Admin',
      lastName: 'Kamerinos',
      phone: '3000000000',
      role: 'ADMIN',
      description: 'Administrador del sistema Kamerinos SPA',
      emailVerified: true,
    },
  });

  // ── Reemplazo del catálogo placeholder ─────────────────────────────
  // Requiere una BD sin Bookings apuntando a los servicios viejos.
  // Si falla por FK (bookings existentes), reseedear desde cero:
  //   npx prisma migrate reset (o drop + migrate deploy + db seed).
  await prisma.product.deleteMany({ where: { slug: { in: OLD_PRODUCT_SLUGS } } });
  await prisma.service.deleteMany({ where: { slug: { in: OLD_SERVICE_SLUGS } } });
  await prisma.category.deleteMany({ where: { slug: { in: OLD_CATEGORY_SLUGS } } });

  // ── Categorías reales ──────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.upsert({ where: { slug: 'linea-integral' }, update: {}, create: { name: 'Línea Integral', slug: 'linea-integral', description: 'Suplementos y kits integrales de bienestar', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'linea-estetica' }, update: {}, create: { name: 'Línea Estética', slug: 'linea-estetica', description: 'Cuidado y belleza de la piel', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'linea-oral' }, update: {}, create: { name: 'Línea Oral', slug: 'linea-oral', description: 'Suplementos de uso oral', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'linea-nebulizada' }, update: {}, create: { name: 'Línea Nebulizada', slug: 'linea-nebulizada', description: 'Tratamientos homeopáticos nebulizados', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'linea-veterinaria' }, update: {}, create: { name: 'Línea Veterinaria', slug: 'linea-veterinaria', description: 'Cuidado y bienestar para mascotas', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'faciales' }, update: {}, create: { name: 'Faciales', slug: 'faciales', description: 'Tratamientos faciales y rituales de piel', isActive: true } }),
    prisma.category.upsert({ where: { slug: 'capilar' }, update: {}, create: { name: 'Capilar', slug: 'capilar', description: 'Cuidado y salud del cuero cabelludo y fibra capilar', isActive: true } }),
  ]);

  const catMap: Record<string, string> = {};
  categories.forEach((c) => { catMap[c.slug] = c.id; });

  // ── Productos reales (precios COP, sin imágenes) ───────────────────
  const products = [
    { name: 'Colección H&M Tratamiento Uterino', slug: 'coleccion-hm-tratamiento-uterino', description: 'Kit integral diseñado para el cuidado del cuerpo. Alivia menstruaciones intensas con metrorragias de sangre oscura, equimosis espontánea y cefaleas congestivas. Incluye 5 viales de 5ml, Bioregulador e instrucciones de uso.', price: 205000, compareAtPrice: 246000, stock: 100, sku: 'HM-INTEGRAL-UTERINO', sponsor: 'H&M Pharmaceutica', isFeatured: true, categoryId: catMap['linea-integral'] },
    { name: 'Colección H&M Tratamiento Intestinal (Mucosa)', slug: 'coleccion-hm-tratamiento-intestinal', description: 'Recupera el equilibrio de la fibra intestinal, mejora los trastornos digestivos, combate el mal aliento y alivia el estreñimiento. Incluye 5 viales de 5ml, Bioregulador e instrucciones.', price: 205000, compareAtPrice: null, stock: 100, sku: 'HM-INTEGRAL-INTESTINAL', sponsor: 'H&M Pharmaceutica', isFeatured: false, categoryId: catMap['linea-integral'] },
    { name: 'Colección H&M Tratamiento Muscular (Traudol)', slug: 'coleccion-hm-tratamiento-muscular-traudol', description: 'Alivia procesos inflamatorios, traumatismos, degeneración articular, artritis, dolor muscular y trastornos vasculares. Incluye 5 viales de 5ml y Bioregulador.', price: 205000, compareAtPrice: null, stock: 100, sku: 'HM-INTEGRAL-TRAUDOL', sponsor: 'H&M Pharmaceutica', isFeatured: true, categoryId: catMap['linea-integral'] },
    { name: 'Vitamina C Awa Integral', slug: 'vitamina-c-awa-integral', description: 'Antioxidante esencial que refuerza el sistema inmune, promueve la regeneración celular y combate el estrés oxidativo. Absorción rápida y efectiva. Esencial para la producción de colágeno y prevenir envejecimiento prematuro.', price: 103000, compareAtPrice: 123000, stock: 150, sku: 'AWA-VIT-C', sponsor: 'Awa Nutrición', isFeatured: true, categoryId: catMap['linea-integral'] },
    { name: 'Procaína HCL 100ml', slug: 'procaina-hcl-100ml', description: 'Compuestos derivados de la novocaína, utilizados principalmente para bloquear la transmisión de señales nerviosas y aliviar el dolor en áreas específicas del cuerpo.', price: 123000, compareAtPrice: null, stock: 80, sku: 'AWA-PROCAINA-100', sponsor: 'Awa', isFeatured: false, categoryId: catMap['linea-integral'] },
    { name: 'Complejo BIO-12 20ml', slug: 'complejo-bio-12', description: 'Suplemento vitamínico que contiene cobalamina, esencial para el funcionamiento del sistema nervioso y la formación de glóbulos rojos. Previene anemia, fatiga y trastornos cognitivos.', price: 82000, compareAtPrice: null, stock: 100, sku: 'AWA-BIO-12', sponsor: 'Awa', isFeatured: false, categoryId: catMap['linea-integral'] },
    { name: 'Terapia Celular Plux (5 viales)', slug: 'terapia-celular-plux', description: 'Mejora la condición de vida de las células, estimulando su regeneración y función óptima, promoviendo mayor energía, vitalidad y bienestar general.', price: 185000, compareAtPrice: 226000, stock: 50, sku: 'PLUX-TERAPIA-CEL', sponsor: 'Linea Plux', isFeatured: true, categoryId: catMap['linea-integral'] },
    { name: 'Colag Plux (5 viales)', slug: 'colag-plux', description: 'Mejora la elasticidad y firmeza de la piel, reduce arrugas y promueve una apariencia más joven. Fortalece articulaciones y tejidos.', price: 164000, compareAtPrice: null, stock: 60, sku: 'PLUX-COLAG', sponsor: 'Linea Plux', isFeatured: false, categoryId: catMap['linea-integral'] },
    { name: 'NAD+ Plux (5 viales)', slug: 'nad-plux', description: 'Fórmula antioxidante que ayuda a revitalizar el cuerpo desde el interior, promoviendo la producción celular de energía y combatiendo el envejecimiento.', price: 246000, compareAtPrice: 308000, stock: 40, sku: 'PLUX-NAD', sponsor: 'Linea Plux', isFeatured: true, categoryId: catMap['linea-integral'] },
    { name: 'Gel de Cannabis Corporal', slug: 'gel-de-cannabis', description: 'Producto de cuidado corporal que utiliza los beneficios del cannabis para aliviar dolores musculares, reducir inflamación y calmar la piel.', price: 74000, compareAtPrice: 90000, stock: 120, sku: 'AWA-EST-GELCANN', sponsor: 'Awa Estética', isFeatured: false, categoryId: catMap['linea-estetica'] },
    { name: 'Crema Placenta D30', slug: 'crema-placenta-d30', description: 'Tratamiento rejuvenecedor que ayuda a regenerar y revitalizar la piel. Rica en nutrientes y proteínas, promueve la elasticidad y combate arrugas.', price: 90000, compareAtPrice: null, stock: 90, sku: 'AWA-EST-PLACD30', sponsor: 'Awa Estética', isFeatured: true, categoryId: catMap['linea-estetica'] },
    { name: 'Jabón Artesanal Natural (Variedad)', slug: 'jabon-artesanal-natural', description: 'Jabones naturales elaborados a mano con ingredientes como aceites esenciales, plantas y mantecas. Disponibles en Cúrcuma, Cannabis, Naranja, Caléndula, Carbón, Arroz, Aloe Vera, Perejil y Rosas.', price: 33000, compareAtPrice: 41000, stock: 300, sku: 'AWA-JABON-ART', sponsor: 'Awa Natural', isFeatured: true, categoryId: catMap['linea-estetica'] },
    { name: 'Espuma Facial Limpiadora (Aloe Vera + Ácido Hialurónico)', slug: 'espuma-facial-aloe-hialuronico', description: 'Prepara la piel para recibir tu rutina facial preferida. No afecta el manto ácido, dejándola limpia, luminosa, fresca y rejuvenecida.', price: 66000, compareAtPrice: null, stock: 110, sku: 'ALMOS-ESPUMA-FAC', sponsor: 'Almos Pharma', isFeatured: false, categoryId: catMap['linea-estetica'] },
    { name: 'Sérum Facial (Vitamina C + Ácido Hialurónico)', slug: 'serum-facial-vit-c-hialuronico', description: 'Formulado para reducir visiblemente las líneas de expresión con una alta concentración de ingredientes activos.', price: 98000, compareAtPrice: 115000, stock: 95, sku: 'ALMOS-SERUM-FAC', sponsor: 'Almos Pharma', isFeatured: true, categoryId: catMap['linea-estetica'] },
    { name: 'Garcinia Cambogia 90 Cápsulas', slug: 'garcinia-cambogia-90-capsulas', description: 'Ayuda a controlar el apetito, mejora el metabolismo de las grasas y favorece la pérdida de peso de manera saludable.', price: 82000, compareAtPrice: null, stock: 130, sku: 'AWA-ORAL-GARC', sponsor: 'Awa Oral', isFeatured: false, categoryId: catMap['linea-oral'] },
    { name: 'Café de Brusca 250ml', slug: 'cafe-de-brusca', description: 'Opción natural para mejorar la energía y estimular el metabolismo. Rico en antioxidantes, con más de 20 extractos 100% naturales.', price: 74000, compareAtPrice: null, stock: 85, sku: 'AWA-ORAL-BRUSCA', sponsor: 'Awa Natural', isFeatured: true, categoryId: catMap['linea-oral'] },
    { name: 'Tratamiento Nebulizado Alergias (6 viales)', slug: 'tratamiento-nebulizado-alergias', description: 'Alivio de síntomas debidos a reacciones alérgicas: tos, estornudos, dificultad para respirar, fiebre de heno, jaqueca y comezón.', price: 144000, compareAtPrice: 172000, stock: 70, sku: 'NEB-ALERGIAS', sponsor: 'Awa Homeopatía Nebulizada', isFeatured: false, categoryId: catMap['linea-nebulizada'] },
    { name: 'LinfoVet Mascota', slug: 'linfovet-mascota', description: 'Moviliza toxinas por vía linfática y previene varias infecciones mediante procesos bioquímicos. Detoxificación y fortalecimiento del sistema linfático.', price: 62000, compareAtPrice: null, stock: 100, sku: 'VET-LINFOVET', sponsor: 'Awa Vet', isFeatured: false, categoryId: catMap['linea-veterinaria'] },
  ];

  let productsCreated = 0;
  for (const p of products) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        description: p.description,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        stock: p.stock,
        sponsor: p.sponsor,
        isFeatured: p.isFeatured,
        isActive: true,
        categoryId: p.categoryId,
      },
      create: {
        ...p,
        isActive: true,
        mainImage: null,
        carouselImages: [],
      },
    });
    productsCreated++;
  }

  // ── Servicios reales (precios COP, sin imágenes) ────────────────────
  const services = [
    { name: 'Korean Glow Signature', slug: 'korean-glow-signature', description: 'Limpieza facial coreana profunda, exfoliación, hidratación y efecto glow.', price: 200000, compareAtPrice: null, duration: 60, isFeatured: true, categoryId: catMap.faciales },
    { name: 'Glass Skin Ritual', slug: 'glass-skin-ritual', description: 'Experiencia inspirada en la piel de cristal coreana: luminosidad, hidratación y textura uniforme.', price: 250000, compareAtPrice: null, duration: 75, isFeatured: true, categoryId: catMap.faciales },
    { name: 'Aqua Pure Hydrafacial', slug: 'aqua-pure-hydrafacial', description: 'Limpieza profunda + extracción + hidratación con tu Hydrafacial 6 en 1.', price: 150000, compareAtPrice: null, duration: 60, isFeatured: false, categoryId: catMap.faciales },
    { name: 'Luminous Vitamin C', slug: 'luminous-vitamin-c', description: 'Ritual antioxidante e iluminador con vitamina C.', price: 200000, compareAtPrice: null, duration: 60, isFeatured: false, categoryId: catMap.faciales },
    { name: 'Exosome Skin Revival', slug: 'exosome-skin-revival', description: 'Tratamiento rejuvenecedor avanzado con tecnología de exosomas para regeneración celular profunda.', price: 300000, compareAtPrice: null, duration: 90, isFeatured: true, categoryId: catMap.faciales },
    { name: 'Contour Bandage Lift Ritual', slug: 'contour-bandage-lift-ritual', description: 'Experiencia reafirmante y estimulante de la piel con vendas de yeso y aparatología.', price: 180000, compareAtPrice: null, duration: 75, isFeatured: false, categoryId: catMap.faciales },
    { name: 'Kobido Imperial', slug: 'kobido-imperial', description: 'Masaje facial inspirado en Kobido: relajación, drenaje y efecto tensor visual + hidratación.', price: 150000, compareAtPrice: null, duration: 60, isFeatured: true, categoryId: catMap.faciales },
    { name: 'Korean Head Spa Signature', slug: 'korean-head-spa-signature', description: 'Experiencia completa de relajación, limpieza y cuidado del cuero cabelludo.', price: 150000, compareAtPrice: null, duration: 75, isFeatured: true, categoryId: catMap.capilar },
    { name: 'Scalp Detox Ritual', slug: 'scalp-detox-ritual', description: 'Limpieza profunda del cuero cabelludo + exfoliación + hidratación.', price: 100000, compareAtPrice: null, duration: 60, isFeatured: false, categoryId: catMap.capilar },
    { name: 'Capilar Glow Therapy', slug: 'capilar-glow-therapy', description: 'Tratamiento para mejorar la apariencia, suavidad y brillo de la fibra capilar.', price: 120000, compareAtPrice: null, duration: 60, isFeatured: false, categoryId: catMap.capilar },
    { name: 'Hair Repair Luxury', slug: 'hair-repair-luxury', description: 'Tratamiento intensivo para fibra capilar seca, opaca o sensibilizada.', price: 120000, compareAtPrice: null, duration: 60, isFeatured: true, categoryId: catMap.capilar },
    { name: 'Exosome Hair Revival', slug: 'exosome-hair-revival', description: 'Protocolo capilar con exosomas, diferenciando claramente el uso cosmético/estético del tratamiento médico.', price: 250000, compareAtPrice: null, duration: 90, isFeatured: true, categoryId: catMap.capilar },
    { name: 'Diagnóstico Capilar Integral', slug: 'diagnostico-capilar-integral', description: 'Diagnóstico con capilógrafo + valoración visual de cuero cabelludo y fibra + recomendación personalizada.', price: 20000, compareAtPrice: null, duration: 30, isFeatured: false, categoryId: catMap.capilar },
  ];

  for (const s of services) {
    await prisma.service.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        description: s.description,
        price: s.price,
        compareAtPrice: s.compareAtPrice,
        duration: s.duration,
        isFeatured: s.isFeatured,
        isActive: true,
        categoryId: s.categoryId,
      },
      create: {
        ...s,
        isActive: true,
        imageUrl: null,
        mainImage: null,
        carouselImages: [],
      },
    });
  }

  // Los banners de campaña (modelo Banner, posición HERO/STRIP/PORTRAIT) y las
  // imágenes del catálogo NO se siembran aquí porque requieren archivos reales
  // subidos por el admin (/dashboard/banners y /dashboard/productos|servicios).

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
