/**
 * Live Mode Module
 * Completely isolated from the main planning algorithm.
 */

window.SmartSubs = window.SmartSubs || {};

window.SmartSubs.LiveMode = (() => {
    const STORAGE_KEY = 'liveModeSession';
    
    // Internal State
    let originSnapshot = null; // Immutable snapshot of the match at entry
    let liveState = {
        matchId: null,
        status: 'stopped', // 'playing', 'paused', 'stopped'
        currentTime: 0, // in seconds
        currentQuarter: 1,
        players: [], // { id, name, number, positionTag, currentStint, totalPlayed, isOnField, isStarter }
        history: [], // substitutions history
        alerts: [],
        fieldPenalties: [], // { id, playerNumber, positionTag, type, elapsedTime }
        showStats: false
    };
    
    let timerInterval = null;
    let lastSuggestionCount = 0;
    let draggedId = null;

    /**
     * Initialize Live Mode with current match data
     */
    function init(match) {
        if (!match) return;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        originSnapshot = window.SmartSubs.Utils.deepClone(match);
        const saved = loadSession();
        if (saved && saved.matchId === match.id) {
            liveState = saved;
            if (liveState.showStats === undefined) liveState.showStats = false;
            if (liveState.sortKey === undefined) liveState.sortKey = 'totalPlayed';
            if (liveState.sortOrder === undefined) liveState.sortOrder = 'desc';
            if (liveState.fieldPenalties === undefined) liveState.fieldPenalties = [];
            if (liveState.players) {
                const totalQs = (match.config && match.config.periodsCount) ? match.config.periodsCount : 4;
                liveState.players.forEach(p => {
                    if (!p.positionTag) p.positionTag = p.position || 'MID';
                    if (!p.playedPerQuarter) p.playedPerQuarter = new Array(totalQs).fill(0);
                });
            }
            if (liveState.status === 'playing') { startTimer(); }
        } else {
            resetSession(match);
        }
        lastSuggestionCount = 0;
        render();
    }

    function resetSession(match) {
        const totalQs = (match.config && match.config.periodsCount) ? match.config.periodsCount : 4;
        liveState = {
            matchId: match.id,
            config: window.SmartSubs.Utils.deepClone(match.config),
            status: 'stopped',
            currentTime: 0,
            currentQuarter: 1,
            fieldPenalties: [],
            players: match.players.map(p => {
                const isOnField = p.isStarter && p.isActive !== false;
                const posTag = p.positionTag || p.position || 'MID'; 
                return {
                    id: p.id,
                    name: p.name,
                    number: p.number || '?',
                    positionTag: posTag,
                    currentStint: 0,
                    totalPlayed: 0,
                    totalEntries: isOnField ? 1 : 0,
                    totalExits: 0,
                    playedPerQuarter: new Array(totalQs).fill(0),
                    isStarter: p.isStarter,
                    isOnField: isOnField,
                    roles: [...(p.pcAttackRoles || []), ...(p.pcDefenseRoles || [])]
                };
            }),
            history: [],
            alerts: [],
            showStats: false,
            sortKey: 'totalPlayed',
            sortOrder: 'desc'
        };
        saveSession();
    }

    function loadSession() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error("Error loading live session", e);
            return null;
        }
    }

    function saveSession() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(liveState));
        } catch (e) {
            console.error("Error saving live session", e);
        }
    }

    // --- Timer Logic ---

    function toggleTimer() {
        if (liveState.status === 'playing') {
            pauseTimer();
        } else {
            startTimer();
        }
        render();
    }

    function startTimer() {
        // FUERZA LIMPIEZA: garantiza que solo exista UN interval a la vez
        if (timerInterval) clearInterval(timerInterval);
        
        liveState.status = 'playing';
        timerInterval = setInterval(() => {
            liveState.currentTime++;
            
            // Update player timers
            liveState.players.forEach(p => {
                if (p.isOnField) {
                    if (!p.isSuspended) {
                        p.totalPlayed++;
                        if (!p.playedPerQuarter) {
                            const totalQs = (liveState.config && liveState.config.periodsCount) ? liveState.config.periodsCount : 4;
                            p.playedPerQuarter = new Array(totalQs).fill(0);
                        }
                        p.playedPerQuarter[liveState.currentQuarter - 1] = (p.playedPerQuarter[liveState.currentQuarter - 1] || 0) + 1;
                    }
                    p.currentStint++;
                }
            });

            // Update field penalties
            if (liveState.fieldPenalties) {
                liveState.fieldPenalties.forEach(pen => pen.elapsedTime++);
            }
            
            checkAlerts();
            updateTimerUI();
            if (liveState.currentTime % 5 === 0) saveSession();
        }, 1000);
    }

    function pauseTimer() {
        clearInterval(timerInterval);
        timerInterval = null;
        liveState.status = 'paused';
        saveSession();
    }

    function finishQuarter() {
        const totalQuarters = (liveState.config && liveState.config.periodsCount) ? liveState.config.periodsCount : 4;
        const isLastQuarter = liveState.currentQuarter >= totalQuarters;
        const label = isLastQuarter ? 'PARTIDO' : `cuarto ${liveState.currentQuarter}`;

        if (confirm(`¿Finalizar ${label}?`)) {
            pauseTimer();
            if (isLastQuarter) {
                liveState.status = 'finished';
                saveSession();
                render();
            } else {
                liveState.currentTime = 0;
                liveState.currentQuarter++;
                liveState.players.forEach(p => p.currentStint = 0);
                saveSession();
                render();
            }
        }
    }

    function exitSession() {
        if (confirm("Si sales, se perderán las estadísticas. ¿Estás seguro?")) {
            localStorage.removeItem(STORAGE_KEY);
            window.SmartSubs.UI.navigate('plan');
        }
    }

    // --- Substitution Logic ---

    function swapPlayers(onFieldId, offFieldId) {
        const p1 = liveState.players.find(p => p.id === onFieldId);
        const p2 = liveState.players.find(p => p.id === offFieldId);
        
        if (p1 && p2) {
            p1.isOnField = false;
            p1.currentStint = 0;
            p1.totalExits++;
            
            p2.isOnField = true;
            p2.currentStint = 0;
            p2.totalEntries++;
            
            liveState.history.push({ time: liveState.currentTime, out: onFieldId, in: offFieldId });
            checkAlerts();
            saveSession();
            render();
        }
    }

    function executeSwap(onFieldId, offFieldId) {
        swapPlayers(onFieldId, offFieldId);
    }

    function penalizePlayer(playerId, cardType) {
        const p = liveState.players.find(pl => pl.id === playerId);
        if (!p || !p.isOnField) return;

        // 1. Move player to bench
        p.isOnField = false;
        p.currentStint = 0;
        p.isSuspended = cardType; 

        // 2. Add placeholder to field
        liveState.fieldPenalties.push({
            id: 'pen-' + window.SmartSubs.Utils.generateUUID(),
            playerNumber: p.number,
            originalPlayerId: p.id, // VINCULAR AL ID UNICO
            positionTag: p.positionTag,
            type: cardType,
            elapsedTime: 0
        });

        liveState.history.push({ time: liveState.currentTime, out: playerId, type: 'card-' + cardType });
        checkAlerts();
        saveSession();
        render();
    }

    function reentryPlayer(penaltyId, playerId) {
        const penIdx = liveState.fieldPenalties.findIndex(pen => pen.id === penaltyId);
        const pen = liveState.fieldPenalties[penIdx];
        const p = liveState.players.find(pl => pl.id === playerId);
        
        if (penIdx !== -1 && p && !p.isOnField) {
            // Find and clear THE SPECIFIC penalized player state
            const originalP = liveState.players.find(pl => pl.id === pen.originalPlayerId);
            if (originalP) originalP.isSuspended = null;

            // Remove the penalty placeholder
            liveState.fieldPenalties.splice(penIdx, 1);

            // Put player on field
            p.isOnField = true;
            p.currentStint = 0;
            // Clear current player suspension if they were the ones penalized
            if (p.id === pen.originalPlayerId) p.isSuspended = null;

            liveState.history.push({ time: liveState.currentTime, in: playerId, type: 'reentry' });
            checkAlerts();
            saveSession();
            render();
        }
    }

    // --- Validation & Feedback ---

    function checkAlerts() {
        const alerts = [];
        const onFieldPlayers = liveState.players.filter(p => p.isOnField);
        const totalOnFieldCount = onFieldPlayers.length + (liveState.fieldPenalties || []).length;
        
        if (totalOnFieldCount !== 11) {
            alerts.push({ type: 'danger', msg: `Campo incompleto: ${totalOnFieldCount}/11.` });
        }
        
        if (!onFieldPlayers.some(p => p.positionTag === 'GK') && !(liveState.fieldPenalties || []).some(pen => pen.positionTag === 'GK')) {
            alerts.push({ type: 'danger', msg: "FALTA ARQUERA." });
        }
        
        // BUG FIX: usa onFieldPlayers (variable correcta), no onField (que no existe en este scope)
        const allSquadRoles = new Set();
        liveState.players.forEach(p => (p.roles || []).forEach(r => allSquadRoles.add(r)));
        const mandatoryRoles = ['tiradora', 'paradora', 'servidora', 'corredora', 'rebotera', 'poste'];
        mandatoryRoles.forEach(role => {
            if (allSquadRoles.has(role) && !onFieldPlayers.some(p => (p.roles || []).includes(role))) {
                alerts.push({ type: 'warning', msg: `Falta: ${role.toUpperCase()}` });
            }
        });
        liveState.alerts = alerts;
    }

    function getPositionColor(pos) {
        if (pos === 'GK') return 'warning';
        if (pos === 'DEF') return 'success';
        if (pos === 'MID') return 'primary';
        if (pos === 'FWD') return 'danger';
        return 'gray';
    }

    // --- Rendering ---

    function renderBody() {
        const formatTime = (s) => {
            const m = Math.floor(s / 60);
            const sec = s % 60;
            return `${m}:${sec.toString().padStart(2, '0')}`;
        };

        const onField = liveState.players.filter(p => p.isOnField);
        const benchPlayers = liveState.players.filter(p => !p.isOnField);

        const renderPlayerDot = (p, color, isBench) => {
            let tooltip = `${p.name} (#${p.number})`;
            if (p.playedPerQuarter && liveState.currentQuarter > 1) {
                tooltip += "\nTiempo:";
                for (let i = 0; i < liveState.currentQuarter - 1; i++) {
                    tooltip += `\nQ${i+1}: ${formatTime(p.playedPerQuarter[i] || 0)}`;
                }
            }
            return `
                <div class="${isBench ? 'bench-player-dot' : 'field-player-dot'}" 
                     data-id="${p.id}" 
                     draggable="true"
                     title="${tooltip}"
                     ondragstart="window.SmartSubs.LiveMode.handleDragStart(event)"
                     ondragend="window.SmartSubs.LiveMode.handleDragEnd(event)"
                     ondrop="window.SmartSubs.LiveMode.handleDrop(event)"
                     ondragover="window.SmartSubs.LiveMode.handleDragOver(event)"
                     onclick="window.SmartSubs.LiveMode.showPlayerInfo('${p.id}')"
                 style="display:flex; flex-direction:column; align-items:center; cursor:grab; min-width:60px; opacity:${isBench ? '0.8' : '1'};">
                <div class="dot bg-${color}" style="width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.3); border:2px solid ${p.isStarter ? 'var(--accent-warning)' : (isBench ? 'rgba(255,255,255,0.4)' : 'white')}; margin-bottom:4px; position:relative;">
                    ${p.number}
                    ${p.isStarter ? '<i class="fa-solid fa-star" style="position:absolute; top:-6px; right:-6px; color:var(--accent-warning); font-size:10px;"></i>' : ''}
                    ${p.isSuspended ? `<div style="position:absolute; bottom:-4px; right:-4px; width:12px; height:16px; background:${p.isSuspended === 'green' ? '#10b981' : '#f59e0b'}; border:1px solid white; border-radius:2px; box-shadow:0 1px 2px rgba(0,0,0,0.5);"></div>` : ''}
                </div>
                <div style="background:rgba(0,0,0,0.6); color:white; font-size:10px; padding:1px 4px; border-radius:3px; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center;">
                    ${p.name.split(' ')[0]}
                </div>
                <div class="${isBench ? 'player-rest' : 'text-white'}" style="font-size:11px; font-weight:bold; font-family:monospace; margin-top:2px;">
                    ${formatTime(p.currentStint)}
                </div>
                <div class="player-total" style="font-size:9px; color:rgba(255,255,255,0.8);">
                    Tot: ${formatTime(p.totalPlayed)}
                </div>
            </div>`;
        };

        const renderCardPlaceholder = (pen) => `
            <div class="field-player-dot" 
                 data-penalty-id="${pen.id}" 
                 ondrop="window.SmartSubs.LiveMode.handleDrop(event)"
                 ondragover="window.SmartSubs.LiveMode.handleDragOver(event)"
                 style="display:flex; flex-direction:column; align-items:center; cursor:default; min-width:60px;">
                <div class="dot" style="width:34px; height:34px; border-radius:15%; background:${pen.type === 'green' ? '#10b981' : '#f59e0b'}; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 8px rgba(0,0,0,0.5); margin-bottom:4px; position:relative;">
                    <i class="fa-solid fa-gavel" style="color:white; font-size:14px;"></i>
                </div>
                <div style="background:rgba(0,0,0,0.8); color:white; font-size:9px; padding:1px 4px; border-radius:3px; font-weight:bold; letter-spacing:0.5px;">
                    #${pen.playerNumber}
                </div>
                <div style="color:white; font-size:11px; font-weight:bold; font-family:monospace; margin-top:2px; text-shadow:0 1px 2px black;">
                    ${formatTime(pen.elapsedTime)}
                </div>
            </div>`;

        if (liveState.status === 'finished' || liveState.showStats) {
            return renderStatsView(formatTime);
        }

        const renderAlert = (a) => `<div class="alert alert-${a.type}" style="margin-bottom:0.4rem; padding:0.4rem; font-size:0.8rem; border-radius:4px;"><i class="fa-solid fa-circle-exclamation"></i> ${a.msg}</div>`;

        const benchLines = {
            GK: benchPlayers.filter(p => p.positionTag === 'GK'),
            DEF: benchPlayers.filter(p => p.positionTag === 'DEF'),
            MID: benchPlayers.filter(p => p.positionTag === 'MID'),
            FWD: benchPlayers.filter(p => p.positionTag === 'FWD')
        };
        const fieldLines = {
            GK: [...onField.filter(p => p.positionTag === 'GK'), ...liveState.fieldPenalties.filter(pen => pen.positionTag === 'GK')],
            DEF: [...onField.filter(p => p.positionTag === 'DEF'), ...liveState.fieldPenalties.filter(pen => pen.positionTag === 'DEF')],
            MID: [...onField.filter(p => p.positionTag === 'MID'), ...liveState.fieldPenalties.filter(pen => pen.positionTag === 'MID')],
            FWD: [...onField.filter(p => p.positionTag === 'FWD'), ...liveState.fieldPenalties.filter(pen => pen.positionTag === 'FWD')]
        };

        // Sort each line by number/playerNumber to maintain tactical slot alignment
        Object.keys(fieldLines).forEach(key => {
            fieldLines[key].sort((a, b) => (a.number || a.playerNumber) - (b.number || b.playerNumber));
        });

        const renderItems = (items) => items.map(p => {
            if (p.elapsedTime !== undefined) return renderCardPlaceholder(p);
            return renderPlayerDot(p, getPositionColor(p.positionTag), false);
        }).join('');

        return `
            <div class="live-dashboard">
                <div class="field-area" id="drop-target-field">
                    <div style="border-top: 1px solid rgba(255,255,255,0.4); border-bottom: 1px solid rgba(255,255,255,0.4); position: absolute; top:25%; bottom:25%; left:0; right:0; z-index:0;"></div>
                    <div style="border-bottom: 2px solid white; position: absolute; top:50%; left:0; right:0; z-index:0;"></div>
                    <div style="border: 2px solid white; border-radius: 0 0 50% 50%; width: 35%; height: 12%; position:absolute; top:0; left:32.5%; z-index:0; border-top:none;"></div>
                    <div style="border: 2px solid white; border-radius: 50% 50% 0 0; width: 35%; height: 12%; position:absolute; bottom:0; left:32.5%; z-index:0; border-bottom:none;"></div>

                    <div style="display:flex; flex-direction:row-reverse; justify-content:space-around; z-index:1; padding:0 20px;">
                        ${renderItems(fieldLines.FWD)}
                    </div>
                    <div style="display:flex; flex-direction:row-reverse; justify-content:space-around; z-index:1; padding:0 10px;">
                        ${renderItems(fieldLines.MID)}
                    </div>
                    <div style="display:flex; flex-direction:row-reverse; justify-content:space-around; z-index:1; padding:0 20px;">
                        ${renderItems(fieldLines.DEF)}
                    </div>
                    <div style="display:flex; flex-direction:row-reverse; justify-content:center; z-index:1;">
                        ${renderItems(fieldLines.GK)}
                    </div>
                </div>

                <div class="bench-area">
                    <h4 style="position:absolute; top:4px; left:50%; transform:translateX(-50%); font-size:0.6rem; color:rgba(255,255,255,0.3); text-transform:uppercase; letter-spacing:1px; font-weight:bold;">Suplentes</h4>
                    <div class="bench-inner" style="display:flex; flex-direction:column; justify-content:space-around; height:100%;">
                        <div class="bench-row" style="display:flex; flex-direction:row-reverse; justify-content:center; flex-wrap:wrap; gap:0.25rem; min-height:60px;">
                            ${benchLines.FWD.map(p => renderPlayerDot(p, getPositionColor(p.positionTag), true)).join('')}
                        </div>
                        <div class="bench-row" style="display:flex; flex-direction:row-reverse; justify-content:center; flex-wrap:wrap; gap:0.25rem; min-height:60px;">
                            ${benchLines.MID.map(p => renderPlayerDot(p, getPositionColor(p.positionTag), true)).join('')}
                        </div>
                        <div class="bench-row" style="display:flex; flex-direction:row-reverse; justify-content:center; flex-wrap:wrap; gap:0.25rem; min-height:60px;">
                            ${benchLines.DEF.map(p => renderPlayerDot(p, getPositionColor(p.positionTag), true)).join('')}
                        </div>
                        <div class="bench-row" style="display:flex; flex-direction:row-reverse; justify-content:center; flex-wrap:wrap; gap:0.25rem; min-height:60px; position:relative;">
                            <!-- Card Sources (First in row-reverse = Far Right) -->
                            <div style="display:flex; gap:6px; margin-left:15px; border-left:1px solid rgba(255,255,255,0.1); padding-left:10px; align-items:center;">
                                <div class="card-source" draggable="true" ondragstart="window.SmartSubs.LiveMode.handleDragStart(event, 'green')"
                                     style="width:24px; height:32px; background:#10b981; border:2px solid white; border-radius:3px; cursor:grab; box-shadow:0 2px 4px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center;" title="Tarjeta Verde (2m)">
                                     <span style="color:white; font-size:10px; font-weight:bold;">V</span>
                                </div>
                                <div class="card-source" draggable="true" ondragstart="window.SmartSubs.LiveMode.handleDragStart(event, 'yellow')"
                                     style="width:24px; height:32px; background:#f59e0b; border:2px solid white; border-radius:3px; cursor:grab; box-shadow:0 2px 4px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center;" title="Tarjeta Amarilla (5m)">
                                     <span style="color:white; font-size:10px; font-weight:bold;">A</span>
                                </div>
                            </div>
                            
                            ${benchLines.GK.map(p => renderPlayerDot(p, getPositionColor(p.positionTag), true)).join('')}
                        </div>
                    </div>
                </div>

                <div class="alerts-area">
                    <div class="card" style="padding:0.75rem; border-left:4px solid var(--accent-danger);">
                         <h4 style="margin-bottom:0.5rem; font-size:0.85rem;"><i class="fa-solid fa-bell"></i> Alertas</h4>
                         <div id="live-alerts">
                             ${liveState.alerts.map(renderAlert).join('') || '<p class="text-muted text-xs">Sin alertas.</p>'}
                         </div>
                    </div>
                    <div class="card" style="padding:0.75rem; flex:1; display:flex; flex-direction:column; background: rgba(0,0,0,0.02);">
                        <h4 style="margin-bottom:0.5rem; font-size:0.85rem;"><i class="fa-solid fa-lightbulb text-warning"></i> Sugerencias</h4>
                        <div id="plan-suggestions" style="font-size:0.8rem; overflow-y:auto; flex:1;">
                            ${renderSuggestions()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function render() {
        if (window.SmartSubs.UI) window.SmartSubs.UI.render();
    }

    function updateTimerUI() {
        const timerEl = document.getElementById('main-timer');
        if (!timerEl) {
            // El DOM fue reconstruido (ej. Firebase hosting), hacer render completo
            render();
            return;
        }
        const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;
        timerEl.textContent = formatTime(liveState.currentTime);
        
        liveState.players.forEach(p => {
            const pEl = document.querySelector(`[data-id="${p.id}"]`);
            if (pEl) {
                const stintEl = pEl.querySelector('.text-white, .player-rest');
                if (stintEl) stintEl.textContent = formatTime(p.currentStint);
            }
        });

        liveState.fieldPenalties.forEach(pen => {
            const pEl = document.querySelector(`[data-penalty-id="${pen.id}"]`);
            if (pEl) {
                const penTimerEl = pEl.querySelector('div:last-child');
                if (penTimerEl) penTimerEl.textContent = formatTime(pen.elapsedTime);
            }
        });

        const sugEl = document.getElementById('plan-suggestions');
        if (sugEl) {
            const html = renderSuggestions();
            const counts = (html.match(/suggestion-item/g) || []).length;
            if (counts > lastSuggestionCount) playAlertSound();
            lastSuggestionCount = counts;
            sugEl.innerHTML = html;
        }
    }

    function renderSuggestions() {
        if (!originSnapshot || !originSnapshot.plan) return '<p class="text-muted">Sin plan.</p>';
        
        const quarterDuration = (liveState.config && liveState.config.quarterDuration) ? liveState.config.quarterDuration : 10;
        const totalElapsed = ((liveState.currentQuarter - 1) * quarterDuration * 60) + liveState.currentTime;
        const currentMinute = Math.floor(totalElapsed / 60);
        
        const currentBlock = originSnapshot.plan.blocks.find(b => 
            currentMinute >= b.startMinute && currentMinute < b.endMinute
        );
        
        if (!currentBlock) return '<p class="text-muted">Fin del plan.</p>';
        const planIds = currentBlock.onFieldPlayerIds;
        // Excluir jugadoras suspendidas que ya no estan en cancha (tienen tarjeta)
        const liveIds = liveState.players.filter(p => p.isOnField && !p.isSuspended).map(p => p.id);
        const inIds = planIds.filter(id => !liveIds.includes(id));
        const outIds = liveIds.filter(id => !planIds.includes(id));
        if (inIds.length === 0 && outIds.length === 0) return '<p class="text-success">Sincronizado.</p>';
        const inPlayers = inIds.map(id => liveState.players.find(p => p.id === id)).filter(Boolean);
        const outPlayers = outIds.map(id => liveState.players.find(p => p.id === id)).filter(Boolean);
        let html = '<div style="display:flex; flex-direction:column; gap:0.5rem; max-height: 200px; overflow-y:auto; padding-right:5px;">';
        inPlayers.forEach(pIn => {
            const matchIdx = outPlayers.findIndex(pOut => pOut.positionTag === pIn.positionTag);
            if (matchIdx !== -1) {
                const pOut = outPlayers[matchIdx];
                html += `
                    <div class="suggestion-item" onclick="window.SmartSubs.LiveMode.executeSwap('${pOut.id}', '${pIn.id}')" 
                         style="background:rgba(255,255,255,0.05); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.6rem; cursor:pointer; transition:all 0.2s; display:flex; flex-direction:column; gap:2px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="text-success" style="font-weight:bold; font-size:0.85rem;"><i class="fa-solid fa-arrow-right-to-bracket"></i> ${pIn.name}</span>
                            <span class="text-xs text-muted">#${pIn.number}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="text-danger" style="font-size:0.75rem; opacity:0.8;"><i class="fa-solid fa-arrow-right-from-bracket"></i> ${pOut.name}</span>
                            <span class="badge badge-gray text-xs" style="padding:2px 6px; font-size:9px;">${pIn.positionTag}</span>
                        </div>
                    </div>`;
                outPlayers.splice(matchIdx, 1);
            } else {
                html += `<div class="text-success" style="font-size:0.8rem; padding:4px;">• ENTRA: ${pIn.name}</div>`;
            }
        });
        outPlayers.forEach(pOut => { html += `<div class="text-danger" style="font-size:0.8rem; padding:4px;">• SALE: ${pOut.name}</div>`; });
        html += '</div>';
        return html;
    }

    function renderStatsView(formatTime) {
        const numQuarters = (liveState.config && liveState.config.periodsCount) ? liveState.config.periodsCount : 4;
        const sortKey = liveState.sortKey || 'totalPlayed';
        const sortOrder = liveState.sortOrder || 'desc';

        const sorted = [...liveState.players].sort((a, b) => {
            let valA, valB;
            const posOrder = { 'GK': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };

            if (sortKey === 'positionTag') {
                valA = posOrder[a.positionTag] || 99;
                valB = posOrder[b.positionTag] || 99;
            } else if (sortKey === 'name') {
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
            } else if (sortKey.startsWith('q')) {
                const qIdx = parseInt(sortKey.substring(1));
                valA = (a.playedPerQuarter && a.playedPerQuarter[qIdx]) ? a.playedPerQuarter[qIdx] : 0;
                valB = (b.playedPerQuarter && b.playedPerQuarter[qIdx]) ? b.playedPerQuarter[qIdx] : 0;
            } else {
                valA = a[sortKey] || 0;
                valB = b[sortKey] || 0;
            }
            
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        const getSortIcon = (key) => {
            if (sortKey !== key) return '<i class="fa-solid fa-sort" style="opacity:0.2; font-size:0.7rem; margin-left:4px;"></i>';
            return sortOrder === 'asc' 
                ? '<i class="fa-solid fa-sort-up" style="font-size:0.7rem; margin-left:4px; color:var(--accent-primary);"></i>' 
                : '<i class="fa-solid fa-sort-down" style="font-size:0.7rem; margin-left:4px; color:var(--accent-primary);"></i>';
        };

        let qHeaders = '';
        for (let i = 1; i <= numQuarters; i++) {
            const key = `q${i-1}`;
            qHeaders += `<th onclick="window.SmartSubs.LiveMode.sortStats('${key}')" style="text-align:center; cursor:pointer; user-select:none; padding:8px;">Q${i}${getSortIcon(key)}</th>`;
        }

        return `
            <div class="stats-view" style="padding:1rem; max-width:800px; margin:0 auto; background:var(--bg-card); border-radius:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h2 style="margin:0;"><i class="fa-solid fa-chart-bar"></i> Estadísticas</h2>
                    <button class="btn btn-outline btn-sm" onclick="window.SmartSubs.LiveMode.exportToCSV()"><i class="fa-solid fa-download"></i> CSV</button>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                        <thead>
                            <tr style="border-bottom:2px solid var(--border-color); text-align:left;">
                                <th onclick="window.SmartSubs.LiveMode.sortStats('number')" style="padding:8px; cursor:pointer; user-select:none;">#${getSortIcon('number')}</th>
                                <th onclick="window.SmartSubs.LiveMode.sortStats('name')" style="padding:8px; cursor:pointer; user-select:none;">Nombre${getSortIcon('name')}</th>
                                <th onclick="window.SmartSubs.LiveMode.sortStats('positionTag')" style="padding:8px; cursor:pointer; user-select:none;">Pos${getSortIcon('positionTag')}</th>
                                ${qHeaders}
                                <th onclick="window.SmartSubs.LiveMode.sortStats('totalPlayed')" style="padding:8px; text-align:right; cursor:pointer; user-select:none;">Total${getSortIcon('totalPlayed')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sorted.map(p => {
                                let qCells = '';
                                for (let i = 0; i < numQuarters; i++) {
                                    const qTime = (p.playedPerQuarter && p.playedPerQuarter[i]) ? p.playedPerQuarter[i] : 0;
                                    qCells += `<td style="padding:8px; text-align:center; color:rgba(255,255,255,0.7); font-family:monospace;">${formatTime(qTime)}</td>`;
                                }
                                return `
                                    <tr style="border-bottom:1px solid var(--border-color);">
                                        <td style="padding:8px;">${p.number}</td>
                                        <td style="padding:8px; font-weight:bold;">${p.name}</td>
                                        <td style="padding:8px;"><span class="badge badge-gray" style="font-size:10px;">${p.positionTag}</span></td>
                                        ${qCells}
                                        <td style="padding:8px; text-align:right; font-weight:bold; font-family:monospace;">${formatTime(p.totalPlayed)}</td>
                                    </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="margin-top:1rem; display:flex; justify-content:center; gap:1rem;">
                    <button class="btn btn-outline" onclick="window.SmartSubs.LiveMode.toggleStats(false)">Volver</button>
                    ${liveState.status === 'finished' ? `<button class="btn btn-success" onclick="window.SmartSubs.LiveMode.exportToCSV()">Exportar</button>` : ''}
                </div>
            </div>
        `;
    }

    function sortStats(key) {
        if (liveState.sortKey === key) {
            liveState.sortOrder = liveState.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            liveState.sortKey = key;
            liveState.sortOrder = (key === 'name' || key === 'positionTag' || key === 'number') ? 'asc' : 'desc';
        }
        render(); 
    }

    function toggleStats(force) {
        liveState.showStats = (force !== undefined) ? force : !liveState.showStats;
        render();
    }

    function showPlayerInfo(playerId) {
        const p = liveState.players.find(pl => pl.id === playerId);
        if (!p) return;
        const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
        alert(`${p.name} (#${p.number})\nTotal: ${formatTime(p.totalPlayed)}`);
    }

    function handleDragStart(e, cardType) { 
        if (cardType) { e.dataTransfer.setData('text/card', cardType); } 
        else { e.dataTransfer.setData('text/plain', e.currentTarget.dataset.id); } 
    }
    function handleDragOver(e) { e.preventDefault(); }
    function handleDrop(e) {
        e.preventDefault();
        const playerId = e.dataTransfer.getData('text/plain');
        const cardType = e.dataTransfer.getData('text/card');
        const targetPlayerEl = e.target.closest('[data-id]');
        const targetPenaltyEl = e.target.closest('[data-penalty-id]');
        if (cardType && targetPlayerEl) { penalizePlayer(targetPlayerEl.dataset.id, cardType); return; }
        if (playerId && targetPenaltyEl) { reentryPlayer(targetPenaltyEl.dataset.penaltyId, playerId); return; }
        if (playerId && targetPlayerEl && playerId !== targetPlayerEl.dataset.id) {
            const p1 = liveState.players.find(p => p.id === playerId);
            const p2 = liveState.players.find(p => p.id === targetPlayerEl.dataset.id);
            if (p1 && p2 && p1.isOnField !== p2.isOnField) { swapPlayers(p1.isOnField ? p1.id : p2.id, p1.isOnField ? p2.id : p1.id); }
        }
    }
    function handleDragEnd(e) {}

    function playAlertSound() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const context = new AudioCtx();
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.frequency.setValueAtTime(880, context.currentTime);
            gain.gain.setValueAtTime(0.1, context.currentTime);
            osc.connect(gain); gain.connect(context.destination);
            osc.start(); osc.stop(context.currentTime + 0.1);
        } catch (e) {}
    }

    function syncPlan() {
        const match = window.SmartSubs.store.getCurrentMatch();
        if (match) { originSnapshot = window.SmartSubs.Utils.deepClone(match); saveSession(); render(); alert("Sincronizado."); }
    }

    function exportToCSV() {
        const sorted = [...liveState.players].sort((a,b) => b.totalPlayed - a.totalPlayed);
        const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
        let csv = `Numero,Jugadora,Posicion,Tiempo Total\n`;
        sorted.forEach(p => { csv += `${p.number},"${p.name}",${p.positionTag},"${formatTime(p.totalPlayed)}"\n`; });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Stats_${liveState.matchId}.csv`;
        link.click();
    }

    return {
        init, render, renderBody, toggleTimer, handleDragStart, handleDrop, handleDragOver, handleDragEnd, 
        finishQuarter, exitSession, syncPlan, executeSwap, exportToCSV, showPlayerInfo, toggleStats, sortStats,
        getState: () => liveState,
        exit: exitSession
    };
})();
