'use strict';
/**
 * Experience-Driven Guidance Engine — RAG Philosophy Implementation
 * ────────────────────────────────────────────────────────────────────
 * 
 * Implements the core RAG philosophy:
 * 1. RAG Memory (Historical Shop Understanding) ← Highest priority
 * 2. Current shop context (recent activity)
 * 3. Inventory state
 * 4. External context (festival timing)
 * 
 * This engine transforms AI Khata from "Inventory Manager" to "Sales Intelligence Partner"
 * by prioritizing learned experience over momentary signals.
 */
const { generateMemoryBasedRecommendations, getProductExperience, getExperienceInsights } = require('./shopMemory');
const { generateSalesExpansionGuidance, getFestivalRelationshipGuidance } = require('./relationshipIntelligence');
const { callGemini } = require('../config/gemini');

// ── Core Guidance Philosophy ───────────────────────────────────────────────

/**
 * Generate experience-driven guidance following RAG priority order
 */
async function generateExperienceGuidance(storeId, storeType, input) {
    console.log(`[ExperienceEngine] Generating RAG-driven guidance for store ${storeId}`);
    
    // PRIORITY 1: RAG Memory (Historical Shop Understanding) - HIGHEST
    const shopMemory = await generateMemoryBasedRecommendations(storeId, input.inventory, input);
    
    // PRIORITY 2: Product Relationship Intelligence (MOST IMPORTANT per spec)
    const salesExpansion = await generateSalesExpansionGuidance(storeId, input.inventory, input);
    
    // PRIORITY 3: Current Context + Festival Intelligence
    const contextualGuidance = await generateContextualIntelligence(storeId, input);
    
    // PRIORITY 4: Inventory State (lowest priority - only used as supporting context)
    const inventoryContext = analyzeInventoryState(input.inventory, shopMemory);
    
    // Synthesize all intelligence into experience-driven guidance
    return synthesizeExperienceGuidance({
        shopMemory,
        salesExpansion,
        contextualGuidance,
        inventoryContext,
        input,
        storeType
    });
}

// ── RAG Memory Priority Logic ──────────────────────────────────────────────

/**
 * Analyze contextual intelligence (current trends, festivals, patterns)
 */
async function generateContextualIntelligence(storeId, input) {
    const context = {
        businessRhythm: analyzeBusinessRhythm(input.shopActivity),
        trendAnalysis: analyzeSalesTrends(input.recentSales),
        festivalIntelligence: null
    };
    
    // Festival context (only if within 10 days)
    if (input.upcomingFestival && input.upcomingFestival.daysAway <= 10) {
        context.festivalIntelligence = await getFestivalRelationshipGuidance(
            storeId, 
            input.upcomingFestival.name, 
            input.upcomingFestival.daysAway
        );
    }
    
    return context;
}

/**
 * Analyze business rhythm patterns
 */
function analyzeBusinessRhythm(shopActivity) {
    const { recentBusiness, busyDays } = shopActivity;
    
    return {
        momentum: recentBusiness,
        peakDays: busyDays,
        businessAdvice: getBusinessAdvice(recentBusiness, busyDays),
        opportunityWindow: recentBusiness === 'growing' ? 'expansion_ready' : 
                          recentBusiness === 'slowing' ? 'needs_boost' : 'stable_optimize'
    };
}

/**
 * Analyze sales trends for patterns
 */
function analyzeSalesTrends(recentSales) {
    const risingProducts = recentSales.filter(item => item.trend === 'rising');
    const slowingProducts = recentSales.filter(item => item.trend === 'slowing');
    const newProducts = recentSales.filter(item => item.trend === 'new');
    
    return {
        momentum: {
            rising: risingProducts,
            slowing: slowingProducts,
            new: newProducts
        },
        trendStrength: risingProducts.length > slowingProducts.length ? 'positive' : 
                      slowingProducts.length > risingProducts.length ? 'concerning' : 'mixed',
        opportunityProducts: risingProducts.slice(0, 3) // Top 3 rising products
    };
}

/**
 * Analyze inventory state with memory context (lowest priority)
 */
function analyzeInventoryState(inventory, shopMemory) {
    const { strengthBased, memoryStrength } = shopMemory;
    
    const inventoryAnalysis = {
        strengthProductStatus: [],
        memoryGuidedStatus: [],
        opportunityGaps: []
    };
    
    // Check strength products against current inventory
    for (const strengthProduct of strengthBased) {
        const inventoryItem = inventory.find(item => 
            item.product.toLowerCase() === strengthProduct.product.toLowerCase()
        );
        
        inventoryAnalysis.strengthProductStatus.push({
            product: strengthProduct.product,
            isStrengthProduct: true,
            currentStock: inventoryItem?.quantity || 0,
            status: inventoryItem?.quantity > 10 ? 'GOOD' : 
                   inventoryItem?.quantity > 3 ? 'WATCH' : 'LOW',
            memoryContext: strengthProduct.reason,
            priority: 'high' // Strength products get priority
        });
    }
    
    return inventoryAnalysis;
}

// ── Experience Synthesis Engine ────────────────────────────────────────────

/**
 * Build a stock_check card from inventory + recent sales + memory context.
 * Strength products get tighter LOW thresholds (they sell fast).
 */
function buildStockCheckCard(inventory, recentSales, inventoryContext) {
    if (!inventory || !inventory.length) return null;

    const strengthProducts = new Set(
        (inventoryContext.strengthProductStatus || []).map(s => s.product.toLowerCase())
    );
    const recentlySoldSet = new Set(
        (recentSales || []).map(r => r.product.toLowerCase())
    );

    const items = inventory.map(item => {
        const name = item.product;
        const qty = Number(item.quantity) || 0;
        const nameLower = name.toLowerCase();
        const isStrength = strengthProducts.has(nameLower);
        const isActive = recentlySoldSet.has(nameLower);

        let status, reason, action;

        if (isStrength) {
            // Tighter thresholds — strength products sell faster
            if (qty <= 3) {
                status = 'LOW';
                reason = 'Running critically low — one of your top sellers';
                action = 'Order immediately';
            } else if (qty <= 10) {
                status = 'WATCH';
                reason = 'Stock is getting low for a high-demand product';
                action = 'Reorder soon to avoid a stockout';
            } else {
                status = 'GOOD';
                reason = 'Well-stocked strength product';
                action = 'Keep maintaining current levels';
            }
        } else if (isActive) {
            if (qty <= 2) {
                status = 'LOW';
                reason = 'Nearly out of stock';
                action = 'Reorder now';
            } else if (qty <= 7) {
                status = 'WATCH';
                reason = 'Stock is getting thin';
                action = 'Consider restocking this week';
            } else {
                status = 'GOOD';
                reason = 'Sufficient stock for current demand';
                action = 'Monitor regularly';
            }
        } else {
            if (qty === 0) {
                status = 'LOW';
                reason = 'Out of stock';
                action = 'Reorder if you plan to stock this';
            } else if (qty <= 5) {
                status = 'WATCH';
                reason = 'Low stock on slow-moving item';
                action = 'Reorder only if needed';
            } else {
                status = 'GOOD';
                reason = 'Adequate stock';
                action = 'No action needed';
            }
        }

        return { product: name, status, reason, action };
    });

    // Sort: LOW first, then WATCH, then GOOD — cap at 8
    const order = { LOW: 0, WATCH: 1, GOOD: 2 };
    items.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
    const trimmed = items.slice(0, 8);

    // Skip card if everything is GOOD (no actionable info)
    const hasActionable = trimmed.some(i => i.status !== 'GOOD');
    if (!hasActionable) return null;

    return { type: 'stock_check', items: trimmed };
}

/**
 * Build dead stock card — inventory items not moving, with swap ideas
 */
function buildDeadStockCard(inventory, recentSales, salesExpansion) {
    if (!inventory || !inventory.length) return null;

    const recentlySoldSet = new Set((recentSales || []).map(r => r.product.toLowerCase()));
    const slowingSet = new Set(
        (recentSales || []).filter(r => r.trend === 'slowing').map(r => r.product.toLowerCase())
    );
    const inventorySet = new Set(inventory.map(i => i.product.toLowerCase()));

    // Dead = in inventory with qty > 0 but no sales in 28 days, OR trend is slowing
    const deadItems = inventory
        .filter(item => {
            const key = item.product.toLowerCase();
            const qty = Number(item.quantity) || 0;
            if (qty === 0) return false; // out of stock — stock_check handles this
            return !recentlySoldSet.has(key) || slowingSet.has(key);
        })
        .map(item => ({
            product: item.product,
            quantity: Number(item.quantity),
            unit: item.unit || 'units',
            status: recentlySoldSet.has(item.product.toLowerCase()) ? 'slowing' : 'no_sales',
        }))
        // no_sales first, then slowing; within same status, higher qty first (more capital tied up)
        .sort((a, b) => {
            if (a.status !== b.status) return a.status === 'no_sales' ? -1 : 1;
            return b.quantity - a.quantity;
        })
        .slice(0, 6);

    if (!deadItems.length) return null;

    // Swap ideas: missing complementary products + rising/new items not in stock
    const swapIdeas = [
        ...(salesExpansion?.missingComplementary || [])
            .slice(0, 4)
            .map(item => ({
                product: item.missing,
                reason: item.opportunity,
                trigger: item.existing,
            })),
        ...(recentSales || [])
            .filter(r => (r.trend === 'rising' || r.trend === 'new') && !inventorySet.has(r.product.toLowerCase()))
            .slice(0, 2)
            .map(r => ({
                product: r.product,
                reason: r.trend === 'new' ? 'New demand — customers starting to ask for this' : 'Demand is rising steadily',
                trigger: null,
            })),
    ].slice(0, 4);

    return {
        type: 'dead_stock',
        insight: 'Items not moving — free up capital by swapping with faster-selling products',
        deadItems,
        swapIdeas,
    };
}

/**
 * Synthesize all intelligence into coherent experience-driven guidance
 */
function synthesizeExperienceGuidance(intelligence) {
    const {
        shopMemory,
        salesExpansion,
        contextualGuidance,
        inventoryContext,
        input,
        storeType
    } = intelligence;
    
    const guidance = {
        mode: input.upcomingFestival?.daysAway <= 10 ? 'EXPERIENCE_EVENT' : 'EXPERIENCE_NORMAL',
        philosophy: 'experience_driven',
        guidance: []
    };

    // 0. STOCK CHECK — always first, most immediately actionable
    const stockCard = buildStockCheckCard(input.inventory, input.recentSales, inventoryContext);
    if (stockCard) {
        guidance.guidance.push(stockCard);
    }

    // 1. DEAD STOCK — items not moving, suggest swaps (replaces strength_amplification)
    const deadStockCard = buildDeadStockCard(input.inventory, input.recentSales, salesExpansion);
    if (deadStockCard) {
        guidance.guidance.push(deadStockCard);
    }
    
    // 2. EXPANSION SUGGESTIONS (Product relationships - MOST IMPORTANT)
    if (salesExpansion.crossSellOpportunities.length > 0 || salesExpansion.missingComplementary.length > 0) {
        guidance.guidance.push({
            type: 'sales_expansion',
            insight: 'Revenue growth opportunities from your customer patterns',
            crossSell: salesExpansion.crossSellOpportunities.slice(0, 3),
            missingItems: salesExpansion.missingComplementary.slice(0, 3),
            strategy: 'Increase basket size through proven product relationships'
        });
    }
    
    // 3. EXPERIENCE-DRIVEN PATTERNS (current context with memory)
    if (contextualGuidance.trendAnalysis.opportunityProducts.length > 0) {
        guidance.guidance.push({
            type: 'momentum_pattern',
            insight: synthesizeMomentumInsight(contextualGuidance.trendAnalysis, shopMemory),
            action: getPatternAction(contextualGuidance.trendAnalysis, contextualGuidance.businessRhythm),
            products: contextualGuidance.trendAnalysis.opportunityProducts
        });
    }
    
    // 4. FESTIVAL CONTEXT (only if within 10 days AND memory supports it)
    if (input.upcomingFestival?.daysAway <= 10) {
        const festivalGuidance = synthesizeFestivalGuidance(
            input.upcomingFestival,
            contextualGuidance.festivalIntelligence,
            shopMemory,
            input.inventory
        );
        
        if (festivalGuidance) {
            guidance.guidance.push(festivalGuidance);
        }
    }
    
    // 5. SHOP INTELLIGENCE SUMMARY (high-level insights)
    guidance.guidance.push({
        type: 'shop_intelligence',
        insight: generateShopIntelligenceInsight(shopMemory, contextualGuidance),
        memoryStrength: shopMemory.memoryStrength.isExperienced ? 'experienced' : 'learning',
        businessMomentum: contextualGuidance.businessRhythm.momentum,
        nextActions: getNextIntelligenceActions(intelligence)
    });
    
    return guidance;
}

/**
 * Get experience-driven status for products
 */
function getExperienceStatus(strengthProduct, inventoryContext) {
    const inventoryStatus = inventoryContext.strengthProductStatus.find(
        status => status.product.toLowerCase() === strengthProduct.product.toLowerCase()
    );
    
    if (!inventoryStatus) return 'MISSING'; // Strength product not in inventory!
    
    // For strength products, adjust thresholds based on memory
    if (strengthProduct.confidence > 0.80) {
        return inventoryStatus.currentStock > 15 ? 'EXCELLENT' :
               inventoryStatus.currentStock > 5 ? 'GOOD' : 'PRIORITY';
    }
    
    return inventoryStatus.status;
}

/**
 * Get experience-driven actions
 */
function getExperienceAction(strengthProduct, inventoryContext) {
    const status = getExperienceStatus(strengthProduct, inventoryContext);
    
    switch (status) {
        case 'MISSING':
            return `Critical: ${strengthProduct.product} is a proven revenue driver but not in inventory!`;
        case 'PRIORITY':
            return `Stock up on ${strengthProduct.product} - it's one of your strength products`;
        case 'EXCELLENT':
            return `${strengthProduct.product} is well-stocked and performing as expected`;
        default:
            return strengthProduct.recommendation;
    }
}

/**
 * Synthesize momentum insight with memory context
 */
function synthesizeMomentumInsight(trendAnalysis, shopMemory) {
    const { momentum, trendStrength } = trendAnalysis;
    const memoryProducts = shopMemory.strengthBased.map(p => p.product.toLowerCase());
    
    // Check if rising products are also memory strengths
    const risingMemoryProducts = momentum.rising.filter(product => 
        memoryProducts.includes(product.product.toLowerCase())
    );
    
    if (risingMemoryProducts.length > 0) {
        return `Your strength products (${risingMemoryProducts.map(p => p.product).join(', ')}) are gaining momentum - this aligns with your shop's experience`;
    }
    
    if (momentum.rising.length > 0) {
        return `New momentum detected in ${momentum.rising.map(p => p.product).join(', ')} - monitor if this becomes a new strength pattern`;
    }
    
    return `${trendStrength === 'positive' ? 'Positive' : 'Mixed'} sales patterns - focus on your proven strengths`;
}

/**
 * Synthesize festival guidance with memory validation
 */
function synthesizeFestivalGuidance(festival, festivalIntelligence, shopMemory, inventory) {
    const festivalName = festival.name;
    const daysAway = festival.daysAway;
    
    // Check if shop has historical festival experience
    const hasSeasonalMemory = festivalIntelligence && festivalIntelligence.length > 0;
    
    if (!hasSeasonalMemory) {
        // No festival memory - suggest based on shop strengths + festival context
        return {
            type: 'festival_preparation',
            event: festivalName,
            summary: `${festivalName} is ${daysAway} days away - prepare based on your shop strengths`,
            strategy: 'strength_amplification',
            items: synthesizeFestivalFromStrengths(shopMemory.strengthBased, festivalName, inventory),
            experienceNote: 'First time festival approach - building on your existing strengths'
        };
    }
    
    // Has festival memory - use learned experience
    return {
        type: 'festival_experience',
        event: festivalName,
        summary: `${festivalName} is ${daysAway} days away - based on your shop's ${festivalName} experience`,
        strategy: 'memory_guided',
        items: festivalIntelligence.map(rel => ({
            product: rel.productA,
            companion: rel.productB,
            urgency: rel.urgency,
            demandNote: rel.demandNote,
            experienceStrength: rel.strength,
            classification: 'memory_validated'
        })),
        experienceNote: `Using learned patterns from your shop's ${festivalName} history`
    };
}

/**
 * Synthesize festival guidance from shop strengths when no festival memory exists
 */
function synthesizeFestivalFromStrengths(strengthProducts, festivalName, inventory) {
    // Map festival types to categories of products
    const festivalCategories = {
        'Diwali': ['sweets', 'oil', 'ghee', 'dry fruits', 'sugar', 'milk'],
        'Holi': ['milk', 'sugar', 'colors', 'sweets', 'snacks'],
        'Ganesh Chaturthi': ['modak', 'coconut', 'jaggery', 'rice', 'flowers'],
        'Eid': ['dates', 'milk', 'vermicelli', 'dry fruits', 'meat']
    };
    
    const relevantCategories = festivalCategories[festivalName] || [];
    const festivalItems = [];
    
    for (const strengthProduct of strengthProducts) {
        const productLower = strengthProduct.product.toLowerCase();
        const isRelevant = relevantCategories.some(category => 
            productLower.includes(category) || category.includes(productLower)
        );
        
        if (isRelevant) {
            const currentStock = inventory.find(item => 
                item.product.toLowerCase() === productLower
            );
            
            festivalItems.push({
                product: strengthProduct.product,
                urgency: currentStock?.quantity < 5 ? 'high' : 'moderate',
                reason: `${strengthProduct.product} is both a shop strength and ${festivalName} essential`,
                action: `Stock extra ${strengthProduct.product} - combines your expertise with festival demand`,
                classification: 'strength_festival_match',
                memoryStrength: strengthProduct.confidence
            });
        }
    }
    
    return festivalItems;
}

/**
 * Generate shop intelligence insight
 */
function generateShopIntelligenceInsight(shopMemory, contextualGuidance) {
    const { memoryStrength } = shopMemory;
    const { businessRhythm } = contextualGuidance;
    
    if (memoryStrength.isExperienced) {
        return `Your shop has developed strong behavioral patterns (${memoryStrength.productMemoryEntries} product memories, ${memoryStrength.relationshipEntries} relationships). Current momentum: ${businessRhythm.momentum}`;
    }
    
    return `Your shop is building intelligence (${memoryStrength.productMemoryEntries} patterns learned). Keep adding transactions to strengthen AI guidance. Current momentum: ${businessRhythm.momentum}`;
}

/**
 * Get next intelligence-driven actions
 */
function getNextIntelligenceActions(intelligence) {
    const actions = [];
    const { shopMemory, salesExpansion } = intelligence;
    
    if (shopMemory.memoryStrength.isExperienced) {
        actions.push('Focus on strength amplification and sales expansion');
    } else {
        actions.push('Keep building transaction history for better intelligence');
    }
    
    if (salesExpansion.missingComplementary.length > 0) {
        actions.push(`Consider stocking: ${salesExpansion.missingComplementary[0].missing}`);
    }
    
    return actions;
}

/**
 * Get business advice based on rhythm
 */
function getBusinessAdvice(recentBusiness, busyDays) {
    switch (recentBusiness) {
        case 'growing':
            return `Business is growing! Optimize for your busiest days: ${busyDays.join(', ')}`;
        case 'slowing':
            return `Business has slowed. Focus on your strength products and cross-selling`;
        case 'quiet':
            return 'Quiet period. Good time to analyze patterns and plan inventory';
        default:
            return `Steady business rhythm. Peak days: ${busyDays.join(', ')}`;
    }
}

/**
 * Get pattern-based action
 */
function getPatternAction(trendAnalysis, businessRhythm) {
    if (trendAnalysis.trendStrength === 'positive' && businessRhythm.momentum === 'growing') {
        return 'Amplify rising products - momentum is building';
    }
    
    if (trendAnalysis.trendStrength === 'concerning') {
        return 'Return to your strength products to stabilize performance';
    }
    
    return 'Monitor emerging patterns while maintaining core strengths';
}

module.exports = {
    generateExperienceGuidance
};