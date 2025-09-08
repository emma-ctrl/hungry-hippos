-- CreateTable
CREATE TABLE "public"."MealPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attendeeCount" INTEGER NOT NULL,
    "budgetTotal" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Attendee" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dietaryRestrictions" TEXT[],
    "foodPreferences" TEXT[],
    "specialNotes" TEXT,
    "dietarySeverity" TEXT NOT NULL DEFAULT 'moderate',

    CONSTRAINT "Attendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgentDecision" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "decisionData" JSONB NOT NULL,
    "reasoning" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SelectedRecipe" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "mealSlot" TEXT NOT NULL,
    "spoonacularRecipeId" INTEGER NOT NULL,
    "recipeName" TEXT NOT NULL,
    "selectionReasoning" TEXT NOT NULL,
    "estimatedServings" INTEGER NOT NULL,
    "scaledIngredients" JSONB NOT NULL,
    "confidenceScore" DOUBLE PRECISION,

    CONSTRAINT "SelectedRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ShoppingItem" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "estimatedCost" DOUBLE PRECISION,
    "storeSection" TEXT,
    "optimizationReasoning" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ShoppingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BudgetAnalysis" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "costBreakdown" JSONB NOT NULL,
    "optimizationSuggestions" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetAnalysis_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Attendee" ADD CONSTRAINT "Attendee_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "public"."MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentDecision" ADD CONSTRAINT "AgentDecision_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "public"."MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SelectedRecipe" ADD CONSTRAINT "SelectedRecipe_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "public"."MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ShoppingItem" ADD CONSTRAINT "ShoppingItem_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "public"."MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BudgetAnalysis" ADD CONSTRAINT "BudgetAnalysis_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "public"."MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
