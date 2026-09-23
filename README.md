# ReviewSync AI

An AI-powered collaborative code review platform.

## Project Structure

```
.
├── frontend/       # React + TypeScript + Vite + Tailwind CSS
├── backend/        # Node.js + Express + TypeScript + Prisma ORM
├── ai-service/     # Python + FastAPI
└── docker-compose.yml
```

### Frontend

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS 3
- **Port**: 5173

### Backend

- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma with PostgreSQL
- **Port**: 3001

### AI Service

- **Runtime**: Python 3.12
- **Framework**: FastAPI
- **Port**: 8000

### Database

- **Engine**: PostgreSQL 16
- **Port**: 5432

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2+)

## Getting Started

### Run All Services

```bash
docker compose up --build
```

This starts all four containers:

| Service    | URL                     |
|------------|-------------------------|
| Frontend   | http://localhost:5173   |
| Backend    | http://localhost:3001   |
| AI Service | http://localhost:8000   |
| PostgreSQL | localhost:5432          |

### Stop All Services

```bash
docker compose down
```

### Stop and Remove Volumes

```bash
docker compose down -v
```

## Development

Each service can also be run independently for development:

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npx prisma migrate dev
npm run dev
```

### AI Service

```bash
cd ai-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Environment Variables

| Variable       | Service    | Default                                              |
|----------------|------------|------------------------------------------------------|
| `PORT`         | Backend    | `3001`                                               |
| `DATABASE_URL` | Backend    | `postgresql://reviewsync:reviewsync_dev@db:5432/reviewsync` |
| `JWT_SECRET`   | Backend    | `reviewsync-dev-secret-change-in-production`         |
| `VITE_API_URL` | Frontend   | `http://localhost:3001`                              |