// MVP Heuristic Algorithm for Rotation Planning

class Planner {
    constructor(store) {
        this.store = store;
    }

    generatePlan() {
        const match = this.store.getCurrentMatch();
        const config = match.config;
        const totalPeriods = config.periodsCount || 4;
        const quarterMins = config.minsPerPeriod || 15;
        const totalMatchMins = quarterMins * totalPeriods;
        const blocksPerQuarter = Math.ceil(quarterMins / config.blockMinutes);

        const players = match.players.filter(p => p.isActive !== false);

        if (players.length < config.onFieldCount) {
            alert(`No hay suficientes jugadoras (${players.length}) para cubrir la cancha (${config.onFieldCount}).`);
            return null;
        }

        const plan = { blocks: [] };
        const tracking = {};

        players.forEach(p => {
            const fraction = p.playTarget / 10;
            const targetTotalMinutes = fraction * totalMatchMins;

            tracking[p.id] = {
                id: p.id,
                name: p.name,
                positionTag: p.positionTag,
                playTarget: p.playTarget,
                targetTotalMinutes: targetTotalMinutes,
                pcAttackRoles: p.pcAttackRoles || [],
                pcDefenseRoles: p.pcDefenseRoles || [],
                isStarter: p.isStarter || false,
                // Current stats
                minutesPlayed: 0,
                status: 'bench',
                currentStint: 0,
                currentRest: 0
            };
        });

        // Loop over blocks for ONE quarter
        for (let b = 0; b < blocksPerQuarter; b++) {
            const blockStart = b * config.blockMinutes;
            const blockEnd = Math.min((b + 1) * config.blockMinutes, quarterMins);
            const duration = blockEnd - blockStart;
            const remainingMins = quarterMins - blockStart;

            const isPCAttack = match.plan?.blocks?.[b]?.isPCAttack || false;
            const isPCDef = match.plan?.blocks?.[b]?.isPCDef || false;
            const lockedPlayerIds = match.plan?.blocks?.[b]?.lockedPlayerIds || [];

            // 1. Calculate Heuristic Scores
            const candidates = Object.values(tracking).map(t => {
                const targetPerQuarter = t.targetTotalMinutes / totalPeriods;
                const expectedPlayed = (targetPerQuarter / quarterMins) * blockStart;
                const deficit = expectedPlayed - t.minutesPlayed;

                // WEIGHTS
                const sliderWeight = t.playTarget * 40; // Balanced influence
                const deficitWeight = deficit * 80;     // Main target-seeking driver
                const persistenceBonus = (t.status === 'field' ? 100 : 0); 
                
                // Exhaustion penalty (starts at 7m, gradual)
                let exhaustionPenalty = 0;
                if (t.status === 'field' && t.currentStint >= 7 && t.playTarget < 10) {
                    exhaustionPenalty = (t.currentStint - 6) * 50;
                }

                const score = sliderWeight + deficitWeight + persistenceBonus - exhaustionPenalty;

                // 2. Classify by Constraints (ABSOLUTE RULES)
                let mustPlay = false;
                let cannotPlay = false;

                if (t.playTarget >= 10) mustPlay = true;
                if (t.playTarget <= 0) cannotPlay = true;

                // Min rest/stint (2 min)
                if (t.status === 'bench' && t.currentRest > 0 && t.currentRest < 2) cannotPlay = true;
                if (t.status === 'field' && t.currentStint > 0 && t.currentStint < 2) mustPlay = true;

                // Max stint (7 min) - Except slider 100%
                if (t.status === 'field' && t.currentStint >= 7 && t.playTarget < 10) cannotPlay = true;

                // Last 2 minutes - Team Freeze (No subs in/out)
                if (remainingMins <= 2) {
                    if (t.status === 'field') mustPlay = true;
                    if (t.status === 'bench') cannotPlay = true;
                }

                // Initial Starters (Block 0 only)
                if (b === 0 && t.isStarter) mustPlay = true;

                return { ...t, score, mustPlay, cannotPlay };
            });

            // 3. Selection Process
            let selectedIds = new Set();

            // 3a. Add forced players (mustPlay) - while respecting onFieldCount
            candidates.filter(c => c.mustPlay && !c.cannotPlay).forEach(c => {
                if (selectedIds.size < config.onFieldCount) {
                    selectedIds.add(c.id);
                }
            });

            // 3b. Fill by position requirements
            for (const [pos, reqCount] of Object.entries(config.formationRequirements)) {
                let currentPosCount = Array.from(selectedIds).filter(id => tracking[id].positionTag === pos).length;
                let needed = reqCount - currentPosCount;

                if (needed > 0) {
                    let posCandidates = candidates
                        .filter(c => c.positionTag === pos && !selectedIds.has(c.id) && !c.cannotPlay)
                        .sort((a, b) => b.score - a.score);

                    for (let i = 0; i < Math.min(needed, posCandidates.length); i++) {
                        selectedIds.add(posCandidates[i].id);
                    }
                }
            }

            // 3c. Fill remaining slots to reach onFieldCount
            if (selectedIds.size < config.onFieldCount) {
                let remainingCandidates = candidates
                    .filter(c => !selectedIds.has(c.id) && !c.cannotPlay)
                    .sort((a, b) => b.score - a.score);
                
                let idx = 0;
                while (selectedIds.size < config.onFieldCount && idx < remainingCandidates.length) {
                    selectedIds.add(remainingCandidates[idx++].id);
                }
            }

            // 4. Role Validation (Mandatory PC Roles)
            // Skip role correction in last 2 minutes to keep team "frozen"
            if ((isPCAttack || isPCDef) && remainingMins > 2) {
                const requiredRoles = isPCAttack ? 
                    Object.keys(config.situationRequirements.pcAttackRequiredRoles) : 
                    Object.keys(config.situationRequirements.pcDefenseRequiredRoles);

                requiredRoles.forEach(role => {
                    const hasRoleOnField = Array.from(selectedIds).some(id => 
                        (isPCAttack ? tracking[id].pcAttackRoles : tracking[id].pcDefenseRoles).includes(role)
                    );

                    if (!hasRoleOnField) {
                        // Find all possible swaps: (Best Candidate for Role, Worst Player of same position to remove)
                        // Group candidates for the role by position
                        const roleCandidates = candidates.filter(c => 
                            !selectedIds.has(c.id) && !c.cannotPlay && 
                            (isPCAttack ? c.pcAttackRoles : c.pcDefenseRoles).includes(role)
                        );

                        if (roleCandidates.length > 0) {
                            let bestSwap = null;

                            roleCandidates.forEach(cand => {
                                // Find player to replace of SAME position to respect formation
                                const toReplace = Array.from(selectedIds)
                                    .map(id => tracking[id])
                                    .filter(f => !f.mustPlay && f.positionTag === cand.positionTag)
                                    .sort((a, b) => a.score - b.score)[0];

                                if (toReplace) {
                                    const netImpact = cand.score - toReplace.score;
                                    if (bestSwap === null || netImpact > bestSwap.netImpact) {
                                        bestSwap = { cand, toReplace, netImpact };
                                    }
                                }
                            });

                            if (bestSwap) {
                                selectedIds.delete(bestSwap.toReplace.id);
                                selectedIds.add(bestSwap.cand.id);
                            }
                        }
                    }
                });
            }

            // 5. Update states for next block
            Object.values(tracking).forEach(t => {
                if (selectedIds.has(t.id)) {
                    t.status = 'field';
                    t.minutesPlayed += duration;
                    t.currentStint += duration;
                    t.currentRest = 0;
                } else {
                    t.status = 'bench';
                    t.currentRest += duration;
                    t.currentStint = 0;
                }
            });

            // Build block object
            plan.blocks.push({
                blockIndex: b,
                startMinute: blockStart,
                endMinute: blockEnd,
                duration: duration,
                isPCAttack,
                isPCDef,
                lockedPlayerIds: Array.from(lockedPlayerIds),
                onFieldPlayerIds: Array.from(selectedIds),
                alerts: []
            });
        }

        // 6. CLONE the generated quarter
        const firstQuarterBlocks = [...plan.blocks];
        plan.blocks = [];
        let globalBlockIndex = 0;
        let globalStartMinute = 0;

        for (let q = 0; q < totalPeriods; q++) {
            firstQuarterBlocks.forEach((baseBlock) => {
                plan.blocks.push({
                    ...baseBlock,
                    blockIndex: globalBlockIndex,
                    startMinute: globalStartMinute,
                    endMinute: globalStartMinute + baseBlock.duration
                });
                globalStartMinute += baseBlock.duration;
                globalBlockIndex++;
            });
        }

        return plan;
    }
}

window.SmartSubs = window.SmartSubs || {};
window.SmartSubs.Planner = Planner;
