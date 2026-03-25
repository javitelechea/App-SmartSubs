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
                subgroup: p.subgroup || '',
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

        // 0. Identify Squad-Wide Required Roles (Always-On)
        const squadRoles = new Set();
        const roleHolders = {}; // role -> [playerIds]

        players.forEach(p => {
            const pRoles = new Set([...(Array.isArray(p.pcAttackRoles) ? p.pcAttackRoles : []), ...(Array.isArray(p.pcDefenseRoles) ? p.pcDefenseRoles : [])]);
            pRoles.forEach(r => {
                if (r && typeof r === 'string') {
                    squadRoles.add(r);
                    if (!roleHolders[r]) roleHolders[r] = [];
                    roleHolders[r].push(p.id);
                }
            });
        });

        // Unique Role Holders must always play (per user rule)
        const uniqueRoleHolderIds = new Set();
        for (const [role, ids] of Object.entries(roleHolders)) {
            if (ids.length === 1) {
                uniqueRoleHolderIds.add(ids[0]);
            }
        }

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
                    const sliderWeight = t.playTarget * 40; 
                    const deficitWeight = deficit * 80;     
                    const persistenceBonus = (t.status === 'field' ? 100 : 0); 
                    
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

                    // Unique Role Holder Rule (Locked on field - OVERRIDES STINT/REST)
                    const isUniqueHolder = uniqueRoleHolderIds.has(t.id);
                    if (isUniqueHolder) {
                        mustPlay = true;
                        cannotPlay = false; // Cannot be benched if you're the only one for the role
                    }

                    // Min rest (2 min) / Min stint (3 min)
                    if (!isUniqueHolder && t.status === 'bench' && t.currentRest > 0 && t.currentRest < 2) cannotPlay = true;
                    if (!isUniqueHolder && t.status === 'field' && t.currentStint > 0 && t.currentStint < 3) mustPlay = true;

                    // Max stint (7 min) - Except slider 100% or unique holder
                    if (!isUniqueHolder && t.status === 'field' && t.currentStint >= 7 && t.playTarget < 10) cannotPlay = true;

                    // Last 2 minutes - Team Freeze
                    if (remainingMins <= 2) {
                        if (t.status === 'field') mustPlay = true;
                        if (t.status === 'bench' && !isUniqueHolder) cannotPlay = true;
                    }

                    // Initial Starters (Block 0 only)
                    if (b === 0 && t.isStarter) mustPlay = true;

                    return { ...t, score, mustPlay, cannotPlay };
                });

            // 3. Position-Centric Selection Process
            let selectedIds = new Set();
            let blockDebug = { blockIndex: b + 1, counts: {} };

            for (const [pos, reqCount] of Object.entries(config.formationRequirements)) {
                const posCandidates = candidates.filter(c => c.positionTag === pos);
                const posMustPlay = posCandidates.filter(c => c.mustPlay && !c.cannotPlay);
                const posOthers = posCandidates.filter(c => !c.mustPlay && !c.cannotPlay).sort((a, b) => b.score - a.score);
                const posCannotPlayButAvailable = posCandidates.filter(c => c.cannotPlay && c.playTarget > 0).sort((a, b) => b.score - a.score);

                // Calculate Subgroup Requirements based on Starters of this Position
                const posStarters = match.players.filter(p => p.positionTag === pos && p.isStarter);
                const subReqs = {};
                posStarters.forEach(s => {
                    const sg = s.subgroup || '';
                    subReqs[sg] = (subReqs[sg] || 0) + 1;
                });

                // 3a. Conflict Check: Mandatory players exceed available slots
                if (posMustPlay.length > reqCount) {
                    alert(`Conflicto táctico en bloque ${b + 1}: Hay ${posMustPlay.length} jugadoras con slider 100% para la posición ${pos}, pero solo hay ${reqCount} lugares en la formación.`);
                    return null;
                }

                // 3b. Check if even possible to fill position with all available players
                const totalAvailableForPos = posCandidates.filter(c => c.playTarget > 0);
                if (totalAvailableForPos.length < reqCount) {
                    alert(`Imposible completar bloque ${b + 1}: Solo hay ${totalAvailableForPos.length} jugadoras disponibles para ${pos}, pero se requieren ${reqCount}.`);
                    return null;
                }

                // 3c. Fill Mandatory first
                posMustPlay.forEach(c => selectedIds.add(c.id));

                // 3d. Fill with 'others' prioritizing Subgroup Limits
                for (const [sg, sgReq] of Object.entries(subReqs)) {
                    const currentSgCount = Array.from(selectedIds).filter(id => tracking[id].positionTag === pos && (tracking[id].subgroup||'') === sg).length;
                    const sgNeeded = sgReq - currentSgCount;
                    if (sgNeeded > 0) {
                        const sgOthers = posOthers.filter(c => (c.subgroup||'') === sg && !selectedIds.has(c.id));
                        for (let i = 0; i < Math.min(sgNeeded, sgOthers.length); i++) {
                            selectedIds.add(sgOthers[i].id);
                        }
                    }
                }

                let currentPosCount = Array.from(selectedIds).filter(id => tracking[id].positionTag === pos).length;
                let needed = reqCount - currentPosCount;
                if (needed > 0) {
                    const remainingOthers = posOthers.filter(c => !selectedIds.has(c.id));
                    for (let i = 0; i < Math.min(needed, remainingOthers.length); i++) {
                        selectedIds.add(remainingOthers[i].id);
                    }
                }

                // 3e. Fill with 'cannotPlay' prioritizing Subgroup Limits
                for (const [sg, sgReq] of Object.entries(subReqs)) {
                    const currentSgCount = Array.from(selectedIds).filter(id => tracking[id].positionTag === pos && (tracking[id].subgroup||'') === sg).length;
                    const sgNeeded = sgReq - currentSgCount;
                    if (sgNeeded > 0) {
                        const sgCannotPlay = posCannotPlayButAvailable.filter(c => (c.subgroup||'') === sg && !selectedIds.has(c.id));
                        for (let i = 0; i < Math.min(sgNeeded, sgCannotPlay.length); i++) {
                            selectedIds.add(sgCannotPlay[i].id);
                        }
                    }
                }

                currentPosCount = Array.from(selectedIds).filter(id => tracking[id].positionTag === pos).length;
                needed = reqCount - currentPosCount;
                if (needed > 0) {
                    const remainingCannot = posCannotPlayButAvailable.filter(c => !selectedIds.has(c.id));
                    for (let i = 0; i < Math.min(needed, remainingCannot.length); i++) {
                        selectedIds.add(remainingCannot[i].id);
                    }
                }

                blockDebug.counts[pos] = { required: reqCount, actual: Array.from(selectedIds).filter(id => tracking[id].positionTag === pos).length };
            }

            // 3f. Final Lineup Validation & Logging
            const isValidLineup = Object.keys(config.formationRequirements).every(pos => blockDebug.counts[pos].required === blockDebug.counts[pos].actual);
            console.log(`Block ${b+1} Debug:`, blockDebug, isValidLineup ? "VALID" : "INVALID");

            if (!isValidLineup) {
                alert(`Error interno en bloque ${b + 1}: La formación no se completó correctamente por posición.`);
                return null;
            }

            // 4. Unified Role Validation (Always-On)
            if (remainingMins > 2) {
                squadRoles.forEach(role => {
                    const hasRoleOnField = Array.from(selectedIds).some(id => {
                        const p = tracking[id];
                        const pRoles = [...(p.pcAttackRoles || []), ...(p.pcDefenseRoles || [])];
                        return pRoles.includes(role);
                    });

                        if (!hasRoleOnField) {
                            const roleCandidates = candidates.filter(c => 
                                !selectedIds.has(c.id) && 
                                c.playTarget > 0 && 
                                [...(Array.isArray(c.pcAttackRoles) ? c.pcAttackRoles : []), ...(Array.isArray(c.pcDefenseRoles) ? c.pcDefenseRoles : [])].includes(role)
                            );

                        if (roleCandidates.length > 0) {
                            let bestSwap = null;
                            roleCandidates.forEach(cand => {
                                const victims = Array.from(selectedIds)
                                    .map(id => candidates.find(c => c.id === id))
                                    .filter(f => 
                                        f.positionTag === cand.positionTag && 
                                        !f.mustPlay && 
                                        !uniqueRoleHolderIds.has(f.id)
                                    );

                                // Victim Safeguard: Do not leave another required role empty
                                const safeVictims = victims.filter(v => {
                                    const vRoles = [...(v.pcAttackRoles || []), ...(v.pcDefenseRoles || [])];
                                    if (vRoles.length === 0) return true;
                                    
                                    return vRoles.every(vRole => {
                                        const candHasVRole = [...(cand.pcAttackRoles || []), ...(cand.pcDefenseRoles || [])].includes(vRole);
                                        if (candHasVRole) return true;
                                        
                                        const othersOnFieldWithVRole = Array.from(selectedIds).some(id => {
                                            if (id === v.id) return false;
                                            const otherP = tracking[id];
                                            const otherPRoles = [...(otherP.pcAttackRoles || []), ...(otherP.pcDefenseRoles || [])];
                                            return otherPRoles.includes(vRole);
                                        });
                                        return othersOnFieldWithVRole;
                                    });
                                });

                                const toReplace = safeVictims.sort((a, b) => a.score - b.score)[0];
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
