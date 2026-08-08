# Plan de Arquitectura e Infraestructura: SaaS Kamerinos SPA

## 1. Análisis de Arquitectura: ¿Unificado o Microservicios?

Para la etapa actual del proyecto y considerando que el objetivo es tener un producto robusto pero mantenible (especialmente si lo gestionas de forma independiente), **la recomendación estricta es un Monolito Modular con un Microservicio Auxiliar para la IA**.

*   **Por qué NO Microservicios completos:** Separar el agendamiento, usuarios, pagos y catálogo en servicios distintos introduce una complejidad operativa innecesaria (latencia de red, transacciones distribuidas, despliegues complejos). 
*   **Por qué Monolito Modular (Backend Principal):** Usando un framework moderno, puedes tener toda la lógica de negocio (PostgreSQL, Wompi, Meta CAPI, Google Calendar) en un solo servidor backend, pero organizado en módulos internos limpios. Esto facilita el despliegue y mantiene los costos al mínimo.
*   **La excepción (El Bot de IA):** El motor RAG (DeepSeek/Gemini) sí debe ser un microservicio aparte. Procesar IA consume mucha memoria y CPU, y no queremos que un bloqueo procesando un mensaje de WhatsApp ralentice el checkout de un cliente en la web.

## 2. Stack Tecnológico Recomendado

*   **Frontend:** Next.js (App Router) + Tailwind CSS + Shadcn/UI. (Garantiza SSR para el Pixel de Meta y SEO).
*   **Backend Core:** Node.js (NestJS con TypeScript) o Java (Spring Boot 3). Ambos son excelentes para crear un monolito bien estructurado y tipado.
*   **Backend IA (Bot):** Python (FastAPI) + LangChain. Python es el estándar de la industria para IA, permitiendo conectar la API de Meta y procesar los embeddings fácilmente hacia la base de datos.
*   **Base de Datos:** PostgreSQL con la extensión `pgvector` (permite guardar los datos de clientes y los vectores de la IA en el mismo lugar).
*   **Caché y Colas:** Redis (Gestión de sesiones de WhatsApp y bloqueo temporal de agenda).
*   **Infraestructura de VPS:** Traefik (Proxy Inverso y SSL automático), Portainer (Gestión visual de contenedores), Dozzle (Visor de logs en tiempo real).

---

## 3. Plan B: Infraestructura VPS (Docker Compose)

Este archivo levanta toda tu infraestructura en un servidor propio, con proxy inverso y herramientas de monitoreo listas para producción.

**Archivo: `docker-compose.yml`**

```yaml
version: '3.8'

services:
  # ==========================================
  # 1. PROXY & ROUTING
  # ==========================================
  traefik:
    image: traefik:v2.10
    container_name: traefik
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      # - "--entrypoints.websecure.address=:443" # Descomentar para producción con SSL
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080" # Panel web de Traefik (Solo desarrollo)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - spa_network

  # ==========================================
  # 2. MONITOREO Y GESTIÓN
  # ==========================================
  portainer:
    image: portainer/portainer-ce:latest
    container_name: portainer
    restart: always
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer_data:/data
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.portainer.rule=Host(`portainer.localhost`)"
    networks:
      - spa_network

  dozzle:
    image: amir20/dozzle:latest
    container_name: dozzle
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dozzle.rule=Host(`logs.localhost`)"
    networks:
      - spa_network

  # ==========================================
  # 3. BASES DE DATOS & CACHÉ
  # ==========================================
  postgres:
    image: pgvector/pgvector:pg15
    container_name: postgres_db
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secretpassword
      POSTGRES_DB: kamerinos_db
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - spa_network

  redis:
    image: redis:alpine
    container_name: redis_cache
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - spa_network

  # ==========================================
  # 4. APLICACIÓN (MOCKUPS PARA DESARROLLO)
  # ==========================================
  frontend:
    image: node:20-alpine
    container_name: nextjs_frontend
    working_dir: /app
    command: npm run dev # Reemplazar con 'npm start' en prod
    volumes:
      - ./frontend:/app
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(`localhost`)"
    networks:
      - spa_network

  backend-core:
    image: node:20-alpine
    container_name: backend_api
    working_dir: /app
    command: npm run start:dev
    environment:
      - DATABASE_URL=postgres://admin:secretpassword@postgres_db:5432/kamerinos_db
      - REDIS_URL=redis://redis_cache:6379
    volumes:
      - ./backend:/app
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.backend.rule=Host(`api.localhost`)"
    networks:
      - spa_network

  backend-ia:
    image: python:3.11-slim
    container_name: ia_rag_bot
    working_dir: /app
    command: uvicorn main:app --host 0.0.0.0 --port 8000
    environment:
      - DEEPSEEK_API_KEY=tu_api_key
      - DATABASE_URL=postgres://admin:secretpassword@postgres_db:5432/kamerinos_db
    volumes:
      - ./ia_bot:/app
    networks:
      - spa_network

networks:
  spa_network:
    driver: bridge

volumes:
  pg_data:
  redis_data:
  portainer_data: