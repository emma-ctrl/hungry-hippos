# hungry-hippos
Multi Agent System for planning BIG group meals

## Docker Setup

To run the complete meal planning application with Docker:

```bash
# From the project root directory
docker-compose up --build

# This will start:
# - PostgreSQL database on port 5433
# - Backend API on port 3001
# - Frontend on port 3002
```

The application includes:
- **Backend**: Node.js + Express + TypeScript + Prisma + OpenAI integration
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Database**: PostgreSQL with meal planning schema
- **AI Agents**: Multi-agent system for intelligent meal planning