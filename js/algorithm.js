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

        // With the 0-4 scale, 'playTarget' values are 0,1,2,3,4
        // Translate this score directly to a fraction of the match
        // 4 = 100%, 3 = 75%, 2 = 50%, 1 = 25%, 0 = 0% 
        const players = match.players.filter(p => p.isActive !== false && p.playTarget > 0);

        if (players.length < config.onFieldCount) {
            alert(`No hay suficientes jugadoras (${players.length}) para cubrir la cancha (${config.onFieldCount}).`);
            return null;
        }

        const totalBlocks = Math.ceil(config.totalMinutes / config.blockMinutes);
        const plan = { blocks: [] };

        // Object setup
        const tracking = {};

        // Remove flexRatio completely. We use the fair-share expected vs actual played approach.
        players.forEach(p => {
            // Priority 0-4 -> Fraction of match 0-1
            const fraction = p.playTarget / 4;
            const targetTotalMinutes = fraction * totalMatchMins;

            tracking[p.id] = {
                id: p.id,
                name: p.name,
                positionTag: p.positionTag,
                playTarget: p.playTarget,
                targetTotalMinutes: targetTotalMinutes,
                pcAttackRoles: p.pcAttackRoles || [],
                pcDefenseRoles: p.pcDefenseRoles || [],
                // Current stats
                minutesPlayed: 0,
                status: 'bench',
                currentStint: 0,
                currentRest: 0
            };
        });

        // Generate ONLY for one single quarter (minsPerPeriod blocks)

        // Loop over blocks for ONE quarter
        for (let b = 0; b < blocksPerQuarter; b++) {
            const blockStart = b * config.blockMinutes;
            const blockEnd = Math.min((b + 1) * config.blockMinutes, quarterMins);
            const duration = blockEnd - blockStart;

            const isPCAttack = match.plan?.blocks?.[b]?.isPCAttack || false;
            const isPCDef = match.plan?.blocks?.[b]?.isPCDef || false;

            const remainingMinsInQuarter = quarterMins - blockStart;

            // Locked players for this specific block (if any exist from prior plans)
            const lockedPlayerIds = match.plan?.blocks?.[b]?.lockedPlayerIds || [];

            // 1. Evaluate scores for each available player to play this block
            const candidates = Object.values(tracking).map(t => {
                let score = 0;
                let alerts = [];

                // Target per quarter = Total target / 4
                const targetPerQuarter = t.targetTotalMinutes / totalPeriods;

                // Expected minutes they should have played by this blockStart in the quarter
                const expectedPlayed = (targetPerQuarter / quarterMins) * blockStart;

                // Deficit multiplier: heavily boost players who are falling behind their expected ratio, 
                // penalize those playing too much relative to their target.
                const deficit = expectedPlayed - t.minutesPlayed;
                const deficitScore = deficit * 30; // Weight of fairness

                // Base score comes from the 0-4 scale * a strong multiplier
                const baseScore = t.playTarget * 25;

                score = baseScore + deficitScore;

                // Evitar jugar solo 1 o 2 minutos (deben jugar al menos 3 minutos si entraron a la cancha)
                if (t.currentStint > 0 && t.currentStint < 3) {
                    score += 10000; // Lock in deeply (prevent sub out)
                }

                // Evitar descansar solo 1 o 2 minutos (deben descansar al menos 3 minutos si salieron)
                if (t.currentRest > 0 && t.currentRest < 3 && t.status === 'bench') {
                    score -= 10000; // Lock out deeply (prevent sub in)
                }

                // Penalty for playing too long consecutively to force mid-quarter resting
                if (t.status === 'field' && t.currentStint >= 5) {
                    score -= (t.currentStint * 1000);
                }

                // Persistence bonus / Sub-in friction (avoid unnecessary swaps when tied)
                if (t.status === 'field') {
                    score += 20;
                }

                // Evitar que alguien entre o salga en el último minuto del cuarto
                if (remainingMinsInQuarter < 2) {
                    if (t.status === 'field') {
                        score += 50000; // Fuerte bloqueo para quedarse en cancha
                    } else if (t.status === 'bench') {
                        score -= 50000; // Fuerte bloqueo para quedarse en el banco
                    }
                }

                if (t.playTarget <= 0) {
                    score -= 999999; // NEVER pick someone with 0 priority unless literally no one else exists
                }

                // Role Bonus for PC
                if (isPCAttack && t.pcAttackRoles?.length > 0) {
                    score += 100;
                }
                if (isPCDef && t.pcDefenseRoles?.length > 0) {
                    score += 100;
                }

                return { ...t, score, blockAlerts: alerts };
            });

            // 1.5 Ensure at least one player of each PC role is heavily prioritized
            const pcRolesList = ['servidora', 'paradora', 'tiradora', 'corredora', 'rebotera', 'poste'];
            pcRolesList.forEach(role => {
                const playersWithRole = candidates.filter(c => c.pcAttackRoles?.includes(role) || c.pcDefenseRoles?.includes(role));
                if (playersWithRole.length > 0) {
                    // Sort by their natural score to find who most deserves to stay/enter
                    playersWithRole.sort((a, b) => b.score - a.score);
                    // Massive boost to the best available player for this role
                    playersWithRole[0].score += 80000;
                }
            });

            // 2. Selection Process (Greedy approach per position)
            let selectedIds = new Set(lockedPlayerIds);

            // Force starters to play at the beginning of the quarter
            if (b === 0) {
                players.filter(p => p.isStarter).forEach(p => selectedIds.add(p.id));
            }

            // Fill exact forced positions
            for (const [pos, reqCount] of Object.entries(config.formationRequirements)) {
                let currentPosCount = Array.from(selectedIds).filter(id => tracking[id].positionTag === pos).length;
                let needed = reqCount - currentPosCount;

                if (needed > 0) {
                    let posCandidates = candidates.filter(c => c.positionTag === pos && !selectedIds.has(c.id));
                    posCandidates.sort((a, b) => b.score - a.score);

                    for (let i = 0; i < needed; i++) {
                        if (posCandidates[i]) {
                            selectedIds.add(posCandidates[i].id);
                        }
                    }
                }
            }

            // Fill remaining slots if any are missing (only if strictMode allows or we absolutely must reach onFieldCount)
            // Sort remaining candidates by score first!
            const remainingCandidates = candidates.filter(c => !selectedIds.has(c.id)).sort((a, b) => b.score - a.score);
            let remainingIndex = 0;

            while (selectedIds.size < config.onFieldCount && remainingIndex < remainingCandidates.length) {
                const p = remainingCandidates[remainingIndex++];

                // If strict mode, try to respect the max allowed per position unless we have no choice
                if (config.strictMode) {
                    const currentPosCount = Array.from(selectedIds).filter(id => tracking[id].positionTag === p.positionTag).length;
                    const maxAllowed = config.formationRequirements[p.positionTag] || 0;
                    if (currentPosCount >= maxAllowed) {
                        // Skip this player if we have enough of this position.
                        // Wait, if we absolutely must reach 11, and we skipped too many, we might fail to reach 11.
                        // In SmartSubs, as long as we have enough players per required position, we will never hit this.
                        // But let's just allow it if we are desperate (which we shouldn't be).
                        // Let's just strictly skip them if they exceed strict capacity, we'll try the next player.
                        continue;
                    }
                }

                selectedIds.add(p.id);
            }

            // 3. Update states for the next block
            let blockAlertsCombined = [];
            const onFieldPlayerIds = Array.from(selectedIds);

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
                blockIndex: b, // Will be updated during cloning
                startMinute: blockStart, // Will be updated during cloning 
                endMinute: blockEnd, // Will be updated during cloning
                duration: duration,
                isPCAttack,
                isPCDef,
                lockedPlayerIds: Array.from(lockedPlayerIds),
                onFieldPlayerIds,
                alerts: blockAlertsCombined
            });
        }

        // 4. CLONE the generated quarter for all remaining quarters
        const firstQuarterBlocks = [...plan.blocks];
        plan.blocks = []; // Clear and rebuild

        let globalBlockIndex = 0;
        let globalStartMinute = 0;

        for (let q = 0; q < totalPeriods; q++) {
            firstQuarterBlocks.forEach((baseBlock) => {
                const clonedBlock = {
                    ...baseBlock,
                    blockIndex: globalBlockIndex,
                    startMinute: globalStartMinute,
                    endMinute: globalStartMinute + baseBlock.duration,
                    // In a more complex app, we might check if user manually locked a block in Q2, Q3. 
                    // But for this simplified repeating plan, we just mirror exactly.
                };

                plan.blocks.push(clonedBlock);

                globalStartMinute += baseBlock.duration;
                globalBlockIndex++;
            });
        }

        return plan;
    }
}

window.SmartSubs = window.SmartSubs || {};
window.SmartSubs.Planner = Planner;
