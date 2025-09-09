# Meal Planning Multi-Agent System
## Claude Code Implementation Guide

> **OBJECTIVE**: Build an intelligent meal planning system using 3 LLM agents in 2 days with Claude Code assistance.

---

## 📋 Project Requirements

### System Overview
Build a web application where 3 specialized AI agents collaborate to create meal plans for large groups (10-50 people):

1. **Dietary Specialist Agent** - Analyzes dietary restrictions and requirements
2. **Meal Planner Agent** - Searches and selects appropriate recipes via Spoonacular API
3. **Budget Optimizer Agent** - Optimizes costs and creates shopping lists
4. **Smart Orchestrator** - Coordinates agents and makes workflow decisions

### Technology Stack
- **Backend**: Node.js + Express + TypeScript + Prisma + PostgreSQL
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui
- **AI Integration**: OpenAI GPT-4 with function calling
- **External APIs**: Spoonacular for recipe data
- **Deployment**: Docker containers

---

## 🏗️ Architecture Design

### Agent Workflow
```
User Input → Dietary Agent → Meal Planner Agent → Budget Agent → Final Plan
              ↓               ↓                    ↓
         Orchestrator makes intelligent decisions between each step
```

### Core Components
1. **Smart Orchestrator** (`/backend/src/agents/Orchestrator.ts`)
   - Executes workflow sequentially
   - Makes intelligent decisions between steps
   - Handles error recovery and retries

2. **Three Specialist Agents** (`/backend/src/agents/`)
   - Each agent uses OpenAI function calling
   - Structured input/output with reasoning
   - Domain-specific expertise and tools

3. **API Services** (`/backend/src/services/`)
   - OpenAI integration with function calling
   - Spoonacular API client
   - Database operations via Prisma

---

## 📊 Database Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model MealPlan {
  id            String    @id @default(cuid())
  name          String
  attendeeCount Int
  budgetTotal   Float?
  startDate     DateTime
  endDate       DateTime
  status        String    @default("planning")
  createdAt     DateTime  @default(now())
  
  attendees      Attendee[]
  decisions      AgentDecision[]
  recipes        SelectedRecipe[]
  shoppingItems  ShoppingItem[]
  budgetAnalysis BudgetAnalysis[]
}

model Attendee {
  id                  String   @id @default(cuid())
  mealPlanId          String
  name                String
  dietaryRestrictions String[]
  foodPreferences     String[]
  specialNotes        String?
  dietarySeverity     String   @default("moderate")
  
  mealPlan MealPlan @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
}

model AgentDecision {
  id              String   @id @default(cuid())
  mealPlanId      String
  agentType       String   // "dietary" | "meal_planner" | "budget" | "orchestrator"
  decisionType    String
  decisionData    Json
  reasoning       String
  confidenceScore Float?
  createdAt       DateTime @default(now())
  
  mealPlan MealPlan @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
}

model SelectedRecipe {
  id                  String @id @default(cuid())
  mealPlanId          String
  mealSlot            String // "breakfast_day1", "lunch_day1", etc.
  spoonacularRecipeId Int
  recipeName          String
  selectionReasoning  String
  estimatedServings   Int
  scaledIngredients   Json
  confidenceScore     Float?
  
  mealPlan MealPlan @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
}

model ShoppingItem {
  id                    String @id @default(cuid())
  mealPlanId            String
  ingredientName        String
  quantity              Float
  unit                  String
  estimatedCost         Float?
  storeSection          String?
  optimizationReasoning String?
  priority              Int    @default(1)
  
  mealPlan MealPlan @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
}

model BudgetAnalysis {
  id                      String   @id @default(cuid())
  mealPlanId              String
  totalCost               Float
  costBreakdown           Json
  optimizationSuggestions String
  reasoning               String
  createdAt               DateTime @default(now())
  
  mealPlan MealPlan @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
}
```

---

## 🤖 Agent Specifications

### 1. Dietary Specialist Agent
**File**: `/backend/src/agents/DietarySpecialist.ts`

**System Prompt**:
```
You are a professional dietary specialist AI focused on analyzing dietary requirements for group meal planning.

Your responsibilities:
- Analyze attendee dietary restrictions with nuanced understanding
- Assess severity levels (medical allergies vs preferences vs religious requirements)  
- Identify potential cross-contamination risks in group cooking
- Consider cultural and religious dietary sensitivities
- Provide clear reasoning for all dietary decisions

Always consider:
- Medical allergies require strict compliance
- Religious restrictions need cultural sensitivity
- Preferences can be accommodated when possible
- Cross-contamination risks in shared cooking spaces

Respond using the provided function format with detailed reasoning.
```

**Function Tools**:
```typescript
{
  name: "analyze_dietary_requirements",
  description: "Analyze dietary complexity and requirements for meal planning",
  parameters: {
    type: "object",
    properties: {
      overall_complexity: {
        type: "string",
        enum: ["simple", "moderate", "complex", "very_complex"]
      },
      primary_constraints: {
        type: "array",
        items: { type: "string" }
      },
      cross_contamination_risks: {
        type: "array", 
        items: { type: "string" }
      },
      special_accommodations: {
        type: "array",
        items: { type: "string" }
      },
      reasoning: {
        type: "string",
        description: "Detailed analysis reasoning"
      },
      confidence_score: {
        type: "number",
        minimum: 0,
        maximum: 1
      }
    },
    required: ["overall_complexity", "primary_constraints", "reasoning", "confidence_score"]
  }
}
```

### 2. Meal Planner Agent
**File**: `/backend/src/agents/MealPlanner.ts`

**System Prompt**:
```
You are a professional chef AI specializing in large group meal planning. You have extensive knowledge of recipes, cooking techniques, and practical considerations for feeding groups.

Your responsibilities:
- Search for recipes that work well for large groups
- Ensure dietary compliance across all selected recipes
- Balance nutrition, variety, and cooking practicality
- Consider cooking logistics, timing, and skill level requirements
- Adapt recipes for group sizes while maintaining quality

Focus on:
- Recipes that scale well and use accessible ingredients
- Balanced nutrition across breakfast, lunch, and dinner
- Practical cooking considerations for group settings
- Cultural food variety and appeal
- Dietary restriction compliance

Use the recipe search tools to find appropriate options, then select the best recipes with clear reasoning.
```

**Function Tools**:
```typescript
{
  name: "search_recipes",
  description: "Search Spoonacular for recipes matching criteria",
  parameters: {
    type: "object", 
    properties: {
      query: { type: "string" },
      diet: { type: "string" },
      intolerances: { type: "array", items: { type: "string" } },
      type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
      number: { type: "number", minimum: 5, maximum: 50 },
      maxReadyTime: { type: "number" }
    },
    required: ["number"]
  }
},
{
  name: "get_recipe_details",
  description: "Get detailed information about specific recipes",
  parameters: {
    type: "object",
    properties: {
      recipeIds: { type: "array", items: { type: "number" } }
    },
    required: ["recipeIds"]
  }
}
```

### 3. Budget Optimizer Agent
**File**: `/backend/src/agents/BudgetOptimizer.ts`

**System Prompt**:
```
You are a financial optimization specialist AI focused on food budgeting and cost optimization for group meal planning.

Your responsibilities:
- Analyze total costs and budget compliance
- Identify cost-saving opportunities without compromising quality
- Organize shopping lists for maximum efficiency
- Suggest budget reallocation for optimal value
- Provide cost-benefit analysis for ingredient choices

Consider:
- Quality vs cost trade-offs for different food categories
- Bulk buying opportunities and storage considerations
- Seasonal pricing and ingredient availability
- Store organization for efficient shopping
- Contingency planning within budget constraints

Focus on practical, implementable cost optimizations while maintaining meal quality and dietary compliance.
```

**Function Tools**:
```typescript
{
  name: "optimize_budget_and_shopping",
  description: "Optimize shopping list and budget allocation", 
  parameters: {
    type: "object",
    properties: {
      total_estimated_cost: { type: "number" },
      cost_breakdown: { type: "object" },
      optimization_suggestions: { type: "array", items: { type: "string" } },
      shopping_list_organized: { 
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string" },
            estimated_cost: { type: "number" },
            store_section: { type: "string" },
            priority: { type: "number" }
          }
        }
      },
      reasoning: { type: "string" },
      confidence_score: { type: "number", minimum: 0, maximum: 1 }
    },
    required: ["total_estimated_cost", "shopping_list_organized", "reasoning", "confidence_score"]
  }
}
```

---

## 🔄 Smart Orchestrator Logic

**File**: `/backend/src/agents/Orchestrator.ts`

```typescript
class SmartOrchestrator {
  async executeWorkflow(mealPlanId: string): Promise<WorkflowResult> {
    // Step 1: Dietary Analysis
    const dietaryResult = await this.dietaryAgent.analyze(mealPlanId);
    await this.saveDecision(mealPlanId, 'dietary', dietaryResult);
    
    // Orchestrator Decision: Need deeper dietary analysis?
    if (dietaryResult.complexity === 'very_complex' || dietaryResult.confidence < 0.7) {
      const refinedAnalysis = await this.dietaryAgent.refineAnalysis(mealPlanId);
      dietaryResult = refinedAnalysis;
    }
    
    // Step 2: Recipe Selection
    const recipeResult = await this.mealPlannerAgent.selectRecipes(mealPlanId, dietaryResult);
    await this.saveDecision(mealPlanId, 'recipes', recipeResult);
    
    // Orchestrator Decision: Sufficient recipe variety and quality?
    if (recipeResult.varietyScore < 0.6 || recipeResult.avgConfidence < 0.7) {
      const improvedRecipes = await this.mealPlannerAgent.improveSelection(mealPlanId, recipeResult);
      recipeResult = improvedRecipes;
    }
    
    // Step 3: Quantity Calculations (Deterministic)
    const quantities = await this.calculateQuantities(recipeResult);
    
    // Step 4: Budget Optimization
    const budgetResult = await this.budgetAgent.optimize(mealPlanId, quantities);
    await this.saveDecision(mealPlanId, 'budget', budgetResult);
    
    // Orchestrator Decision: Significant budget overrun?
    if (budgetResult.budgetOverage > 0.15) {
      const revisedPlan = await this.coordinateBudgetFix(mealPlanId, recipeResult, budgetResult);
      return revisedPlan;
    }
    
    return this.generateFinalPlan(mealPlanId);
  }
}
```

---

## 📁 Required File Structure

```
meal-planning-system/
├── docker-compose.yml
├── .dockerignore
├── backend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── agents/
│   │   │   ├── DietarySpecialist.ts
│   │   │   ├── MealPlanner.ts
│   │   │   ├── BudgetOptimizer.ts
│   │   │   └── Orchestrator.ts
│   │   ├── services/
│   │   │   ├── openai.ts
│   │   │   ├── spoonacular.ts
│   │   │   ├── database.ts
│   │   │   └── calculations.ts
│   │   ├── routes/
│   │   │   └── mealPlans.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── server.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── .env
│   └── package.json
├── frontend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── plan/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── MealPlanForm.tsx
│   │   │   ├── AgentProgress.tsx
│   │   │   ├── AgentDecisions.tsx
│   │   │   ├── FinalPlan.tsx
│   │   │   └── ui/ (shadcn components)
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── utils.ts
│   │   └── types/
│   │       └── index.ts
│   ├── .env.local
│   └── package.json
└── shared/
    └── types.ts
```

---

## 🚀 Implementation Steps for Claude Code

### Step 1: Project Setup (45 minutes)
```bash
# Create project structure
mkdir meal-planning-system && cd meal-planning-system
mkdir backend frontend shared

# Backend setup
cd backend
npm init -y
npm install express prisma @prisma/client openai axios cors dotenv helmet
npm install -D typescript @types/node @types/express @types/cors ts-node nodemon
npx tsc --init
npx prisma init

# Frontend setup  
cd ../frontend
npx create-next-app@latest . --typescript --tailwind --app --src-dir
npm install @radix-ui/react-icons lucide-react
npx shadcn-ui@latest init
```

### Step 1.5: Docker Setup (15 minutes)
```bash
# Create Docker configuration files
cd .. # Back to root directory

# Create docker-compose.yml with PostgreSQL, backend, and frontend services
# Create Dockerfile for backend (Node.js with Prisma)
# Create Dockerfile for frontend (Next.js production build)
# Create .dockerignore to exclude node_modules and .env files

# Test Docker setup
docker-compose up --build -d postgres
# Verify PostgreSQL container is running
```

(Note for self: in retrospect step 1 doesn't make sense and docker setup should be done as step 1 - always learning)

### Step 2: Database Schema Implementation (15 minutes)
- Update DATABASE_URL in .env to use Docker PostgreSQL container
- Implement the Prisma schema as specified above
- Run `npx prisma migrate dev --name init` (with Docker PostgreSQL running)
- Generate Prisma client with `npx prisma generate`

### Step 3: Simple Service Architecture (30 minutes) ✅
**Direct Service Exports** ✅
- **Database Service**: All Prisma operations with direct function exports
- **OpenAI Service**: Function calling setup with direct function exports  
- **Spoonacular Service**: Recipe search and details with direct function exports
- **Calculation Service**: Pure calculation functions with direct exports
- **Simple Express Server**: Basic REST API with direct service imports

**Simple Architecture Benefits** ✅
- No context creation complexity
- Direct function imports where needed
- Easier debugging and testing
- Cleaner, more straightforward code
- Faster server startup

### Step 4: REST API Routes (1 hour)
**Build in this order:**
1. **Meal Plans Routes** (`/backend/src/routes/mealPlans.ts`) (20 minutes)
   - POST `/api/meal-plans` - Create meal plan with validation
   - GET `/api/meal-plans/:id` - Get complete meal plan data
   - POST `/api/meal-plans/:id/attendees` - Add attendees with dietary data

2. **Agent Routes** (`/backend/src/routes/agents.ts`) (40 minutes)
   - POST `/api/agents/dietary/analyze` - Dietary analysis endpoint
   - POST `/api/agents/meal-planner/search` - Recipe search endpoint  
   - POST `/api/agents/meal-planner/select` - Recipe selection endpoint
   - POST `/api/agents/budget/optimize` - Budget optimization endpoint
   - Direct service imports: `import { analyzeDietary } from '../services/openai.js'`


### Step 5: Smart Orchestrator (45 minutes)
- Implement workflow execution logic
- Add intelligent decision-making between steps
- Include error recovery and retry mechanisms
- Real-time progress updates

### Step 6: Frontend Components (2 hours)
**Component priority:**
1. **MealPlanForm.tsx** - Input form for attendees and constraints
2. **AgentProgress.tsx** - Real-time workflow progress display
3. **AgentDecisions.tsx** - Timeline of agent decisions with reasoning
4. **FinalPlan.tsx** - Complete meal plan with recipes and shopping list

### Step 7: Integration & Testing (30 minutes)
- End-to-end workflow testing
- Error handling verification
- Performance optimization
- Deployment preparation

---

## 🔧 Environment Variables

### Backend (.env)
```env
DATABASE_URL="postgresql://username:password@localhost:5432/mealplanning"
OPENAI_API_KEY="sk-..."
SPOONACULAR_API_KEY="..."
NODE_ENV="development"
PORT=3001
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

---

## 🧪 Testing Strategy

### Agent Testing
Create test cases for each agent:
```typescript
// Test complex dietary scenarios
const testDietaryAgent = async () => {
  const complexCase = {
    attendees: [
      { name: "Alice", restrictions: ["vegan", "gluten-free", "nut-allergy"] },
      { name: "Bob", restrictions: ["kosher"] },
      { name: "Carol", restrictions: ["lactose-intolerant"] }
    ]
  };
  
  const result = await dietaryAgent.analyze(complexCase);
  // Verify reasoning quality and confidence scores
};
```

### Integration Testing
```typescript
// Test complete workflow
const testFullWorkflow = async () => {
  const mealPlan = await createTestMealPlan();
  const result = await orchestrator.executeWorkflow(mealPlan.id);
  // Verify all agents executed and produced coherent results
};
```

---

## 📊 Success Metrics

### Technical Requirements
- [ ] All 3 agents execute successfully with >80% confidence scores
- [ ] Workflow completes end-to-end in under 3 minutes
- [ ] Dietary restrictions compliance: 100% for allergies, >90% for preferences
- [ ] Recipe selection variety: >0.7 variety score across meals
- [ ] Budget optimization: Stay within 10% of target budget
- [ ] API costs: <$1.00 per meal plan execution

### User Experience Requirements  
- [ ] Clear real-time progress indication during planning
- [ ] Agent reasoning is understandable and trustworthy
- [ ] Final meal plans are practical and implementable
- [ ] Shopping lists are well-organized by store section
- [ ] System handles edge cases gracefully with helpful error messages

---

## 🚨 Common Issues & Solutions

### Agent Consistency Issues
**Problem**: Agents give inconsistent responses
**Solution**: Improve system prompts with specific examples and constraints

### API Rate Limits
**Problem**: Hitting OpenAI or Spoonacular rate limits
**Solution**: Implement request queuing and caching strategies

### Database Performance
**Problem**: Slow queries during meal planning
**Solution**: Add proper database indexes and optimize Prisma queries

### Frontend State Management
**Problem**: Complex state updates during real-time progress
**Solution**: Use simple useState/useEffect patterns, avoid over-engineering

---

## 🎯 Deployment Checklist

### Pre-deployment
- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] API keys tested and working
- [ ] Error handling tested
- [ ] Performance optimization completed

### Deployment
- [ ] Docker containers built and tested locally
- [ ] Backend deployed using Docker (Railway/Render with container support)
- [ ] Frontend deployed using Docker or static deployment (Vercel)
- [ ] Database hosted (managed PostgreSQL or Docker container)
- [ ] Environment variables set in production
- [ ] CORS configured correctly

### Post-deployment
- [ ] End-to-end testing in production
- [ ] Error monitoring setup
- [ ] Performance monitoring active
- [ ] User feedback collection ready

---

**This implementation guide provides Claude Code with all the context, specifications, and step-by-step instructions needed to build the complete meal planning system efficiently.**
