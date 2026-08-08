Contexto del Proyecto: Plataforma Web & Bot de WhatsApp para Kamerinos SPA Bogotá
1. Objetivo del Negocio

Desarrollar una solución integral para Kamerinos SPA Bogotá (centro de estética y bienestar) que automatice la atención a clientes, la captura de prospectos desde pautas de Meta (Instagram/Facebook Ads), el agendamiento de citas con pago de abono obligatorio y la gestión de la agenda del negocio.
2. Requisitos Funcionales Clave

    Autenticación y Roles: Cliente, Empleado y Administrador.

    Reserva con Abono Previo: El cliente debe pagar un % del valor del servicio mediante pasarela de pagos local (Bold, Wompi o ePayco) para confirmar la cita. Si no asiste, pierde el abono (política de cancelación).

    Sincronización de Agenda: Integración en tiempo real con Google Calendar API (cuenta de la empresa) tras la confirmación del pago del abono.

    Fidelización: Sistema de cupones de descuento y promociones activadas según el historial del cliente en la base de datos.

    Agente IA en WhatsApp Business:

        Integrado a la WhatsApp Cloud API de Meta.

        Responde dudas de servicios/precios y consulta disponibilidad en tiempo real mediante Function Calling.

        Genera enlaces dinámicos pre-diligenciados que redirigen al cliente al checkout de la web.

    Atribución de Pauta (Meta Ads & CAPI):

        Captura del parámetro referral.ctwa_clid de los anuncios Click-to-WhatsApp.

        Integración con Meta Conversions API (CAPI) desde el backend para enviar el evento Purchase o Schedule asociado al ctwa_clid cuando se completa un abono.

3. Arquitectura y Stack Tecnológico

    Backend: Node.js (TypeScript / NestJS) o Java 21 (Spring Boot).

    Frontend / E-commerce: Next.js (React), Tailwind CSS, Shadcn/UI (SSR optimizado para SEO local y Meta Pixel).

    Base de Datos: PostgreSQL (modelo relacional) + Redis (bloqueo temporal de slots de agenda y caché de estado de conversación de WhatsApp).

    Motor de IA (Bot): Gemini 1.5 Flash (o GPT-4o-mini) con Tool Use / Function Calling e historial en Redis.

    Infraestructura / DevOps:

        Servidor VPS Linux (Fedora/Ubuntu) corriendo en Podman / Docker Compose.

        Proxy Inverso Nginx + SSL con Certbot / Cloudflare.

        Pasarela de pagos local (Bold / Wompi) conectada vía Webhooks.

4. Flujo End-to-End de Conversión

    Ad: Cliente ve pauta en Instagram y hace clic en Enviar mensaje a WhatsApp.

    Chat (IA): El backend recibe el webhook con el ctwa_clid. El Bot (Gemini Flash) aclara dudas y verifica agenda en PostgreSQL vía Function Calling.

    Checkout (Web): El Bot envía un link pre-llenado ([https://kamerinosspa.com/agendar](https://kamerinosspa.com/agendar)?...). El cliente paga el abono mediante PSE/Nequi/Tarjeta.

    Confirmación & Evento:

        Webhook de pago confirma la reserva en PostgreSQL.

        Se crea el evento en la Google Calendar API de la empresa.

        El backend envía el evento de conversión a Meta CAPI ligado al ctwa_clid para optimizar el retorno de inversión (ROAS) de las pautas.