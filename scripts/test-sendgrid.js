// Kamerinos SPA — Prueba de integración de SendGrid
// Uso:
//   node scripts/test-sendgrid.js <destinatario@email.com>
//
// Lee SENDGRID_API_KEY del entorno o de `.env`. Envía un correo de prueba
// desde el remitente verificado info@sandrapinzonsaludybelleza.com.co
// (reply-to kamerinosg@gmail.com) y reporta si SendGrid aceptó (202).

const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const path = require('path');

// Carga simple de .env (solo si la variable no está ya en el entorno)
if (!process.env.SENDGRID_API_KEY) {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.match(/^SENDGRID_API_KEY=(.+)$/);
      if (m) {
        process.env.SENDGRID_API_KEY = m[1].replace(/^"|"$/g, '');
        break;
      }
    }
  }
}

const to = process.argv[2];
if (!to) {
  console.error('Uso: node scripts/test-sendgrid.js <destinatario@email.com>');
  process.exit(1);
}

if (!process.env.SENDGRID_API_KEY) {
  console.error('SENDGRID_API_KEY no encontrada en el entorno ni en .env');
  process.exit(1);
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
  to,
  from: { email: 'info@sandrapinzonsaludybelleza.com.co', name: 'Kamerinos SPA' },
  replyTo: 'kamerinosg@gmail.com',
  subject: 'Prueba de integración — Kamerinos SPA',
  text: 'Si recibes este correo, la integración de SendGrid funciona correctamente.',
  html: '<p>Si recibes este correo, la <strong>integración de SendGrid</strong> funciona correctamente.</p>',
};

sgMail
  .send(msg)
  .then(() => {
    console.log('OK — correo enviado (202). Revisa la bandeja de', to);
  })
  .catch((error) => {
    console.error('ERROR al enviar:');
    console.error(JSON.stringify(error.response?.body || error, null, 2));
    process.exit(1);
  });
