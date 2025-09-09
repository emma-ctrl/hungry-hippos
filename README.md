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

Once initially set up, you can use these commands for daily development:

```bash
# Start the application
docker-compose up

# Stop the application
docker-compose down
```

### Database Inspection

To view and inspect the database during development, use Prisma Studio:

```bash
# Navigate to the backend directory
cd backend

# Start Prisma Studio
npx prisma studio
```

This will open a web interface at `http://localhost:5555` where you can browse and edit your database data directly in the browser.

The application includes:
- **Backend**: Node.js + Express + TypeScript + Prisma + OpenAI integration
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Database**: PostgreSQL with meal planning schema
- **AI Agents**: Multi-agent system for intelligent meal planning