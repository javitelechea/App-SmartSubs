class UI {
    constructor() {
        this.appDiv = document.getElementById('app');
        this.currentRoute = 'home';
        this.editingBlockIndex = null;
    }

    render() {
        let content = '';

        if (this.currentRoute === 'home') {
            content = this.renderHome();
        } else {
            const match = window.SmartSubs.store.getCurrentMatch();
            if (!match) {
                this.navigate('home');
                return;
            }

            content = `
                <div class="flex-between mb-4" style="padding-bottom:1rem; border-bottom:1px solid var(--border-color);">
                    <div style="display:flex; align-items:center; gap: 1rem;">
                        <h1 style="margin:0; font-size:1.5rem;"><i class="fa-solid fa-stopwatch text-primary"></i> SmartSubs</h1>
                        <span class="badge badge-gray" style="font-size: 0.9rem;">${match.config.matchName} | ${match.config.opponent ? 'vs ' + match.config.opponent : 'Sin rival'} | ${match.config.date}</span>
                    </div>
                    <div>
                        <button class="btn btn-outline btn-sm" onclick="window.SmartSubs.UI.navigate('home')"><i class="fa-solid fa-home"></i> Inicio</button>
                    </div>
                </div>
                
                <div class="nav-tabs">
                    <button class="nav-link ${this.currentRoute === 'players' ? 'active' : ''}" data-route="players">1. Vista de Equipo</button>
                    <button class="nav-link ${this.currentRoute === 'plan' ? 'active' : ''}" data-route="plan">2. Plan de Rotación</button>
                </div>
                
                <div class="mt-4">
                <div class="mt-4">
                    ${this.currentRoute === 'players' ? this.renderPlayers() : ''}
                    ${this.currentRoute === 'plan' ? this.renderPlan() : ''}
                </div>
            `;
        }

        this.appDiv.innerHTML = content;

        // Attach events after rendering
        this.attachNavbarEvents();
        this.attachActiveScreenEvents();
    }

    // --- Home Screen ---

    renderHome() {
        const matches = window.SmartSubs.store.getMatches();
        let matchesListHtml = '<p class="text-muted">No hay partidos guardados.</p>';

        if (matches.length > 0) {
            matchesListHtml = matches.map(m => `
                <div class="card mb-4" style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h3 style="margin-bottom:0.25rem;">${m.name}</h3>
                        <p class="text-muted text-sm">${m.opponent ? 'vs ' + m.opponent + ' | ' : ''}${m.date}</p>
                    </div>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn btn-primary" data-action="load-match" data-id="${m.id}">Cargar</button>
                        <button class="btn btn-outline btn-icon" data-action="duplicate-match" data-id="${m.id}" title="Duplicar">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        <button class="btn btn-danger btn-icon" data-action="delete-match" data-id="${m.id}" title="Borrar">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }

        return `
            <div style="max-width: 600px; margin: 0 auto; padding-top: 4rem;">
                <div class="text-center mb-6">
                    <h1><i class="fa-solid fa-stopwatch text-primary"></i> SmartSubs</h1>
                </div>

                <div class="card mb-6">
                    <h3 class="mb-4">Nuevo Partido</h3>
                    <form id="new-match-form">
                        <div class="form-group">
                            <label class="form-label">Nombre del Partido / Categoría</label>
                            <input type="text" id="match-name" class="form-control" required placeholder="Ej. Final Hockey">
                        </div>
                        <div class="form-group flex-between gap-4">
                           <div style="flex:1;">
                               <label class="form-label">Rival (opcional)</label>
                               <input type="text" id="match-opponent" class="form-control" placeholder="Club X">
                           </div>
                           <div style="flex:1;">
                               <label class="form-label">Fecha</label>
                               <input type="date" id="match-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                           </div>
                        </div>
                        <button type="submit" class="btn btn-success" style="width:100%;">Crear y Empezar</button>
                    </form>
                </div>

                <h3>Partidos Guardados</h3>
                ${matchesListHtml}
            </div>
        `;
    }

    attachHomeEvents() {
        const form = document.getElementById('new-match-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const name = document.getElementById('match-name').value;
                const opponent = document.getElementById('match-opponent').value;
                const date = document.getElementById('match-date').value;

                const id = window.SmartSubs.store.createMatch(name, opponent, date);
                window.SmartSubs.store.setCurrentMatch(id);
                this.navigate('players');
            });
        }

        document.querySelectorAll('[data-action="load-match"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                if (window.SmartSubs.store.setCurrentMatch(id)) {
                    this.navigate('players');
                }
            });
        });

        document.querySelectorAll('[data-action="delete-match"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm("¿Seguro que deseas borrar este partido?")) {
                    const id = e.currentTarget.dataset.id;
                    window.SmartSubs.store.deleteMatch(id);
                    this.render();
                }
            });
        });

        document.querySelectorAll('[data-action="duplicate-match"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const matchData = window.SmartSubs.store.data.matchData[id];
                if (matchData) {
                    const matchMeta = window.SmartSubs.store.data.matches.find(m => m.id === id);
                    const newId = window.SmartSubs.store.createMatch(matchMeta.name + " (Copia)", matchMeta.opponent, matchMeta.date);
                    // Copy over players and config (not plan)
                    const newMatchData = window.SmartSubs.store.data.matchData[newId];
                    newMatchData.config = window.SmartSubs.Utils.deepClone(matchData.config);
                    newMatchData.players = window.SmartSubs.Utils.deepClone(matchData.players);
                    // generate new IDs for players to avoid conflicts in future features
                    newMatchData.players.forEach(p => p.id = window.SmartSubs.Utils.generateUUID());
                    window.SmartSubs.store.save();
                    this.render();
                }
            });
        });
    }

    // --- Players Screen (Team View) ---

    renderPlayers() {
        const match = window.SmartSubs.store.getCurrentMatch();
        const players = match.players || [];
        const config = match.config || {};
        const totalMatchMinutes = (config.minsPerPeriod || 15) * (config.periodsCount || 4);

        const posOrder = { 'GK': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };
        players.sort((a, b) => posOrder[a.positionTag] - posOrder[b.positionTag] || parseInt(a.number || 0) - parseInt(b.number || 0));

        const isChecked = (arr, val) => (arr && arr.includes(val)) ? 'checked' : '';
        const activeStartersCount = players.filter(p => p.isActive !== false && p.isStarter).length;
        const maxStartersReached = activeStartersCount >= 11;

        let currentPosGroup = null;

        // Generate rows
        let playerRows = '';
        players.forEach((player, index) => {
            const isActive = player.isActive !== false;
            let targetVal = player.playTarget;

            // Defaulting initialization based on starter status
            if (targetVal === undefined || targetVal === null || targetVal > 4) { // Account for legacy 60m data by resetting
                targetVal = player.isStarter ? 4 : 0;
                player.playTarget = targetVal; // Auto-save back to model
            }

            let rowOpacity = '';
            if (!isActive) {
                rowOpacity = 'opacity: 0.3 !important; filter: grayscale(100%); transition: all 0.2s;';
            } else if (maxStartersReached && !player.isStarter) {
                rowOpacity = 'opacity: 0.4 !important; filter: grayscale(100%); transition: all 0.2s;';
            }

            // Insert Category Header if position changed
            if (player.positionTag !== currentPosGroup) {
                currentPosGroup = player.positionTag;
                let bgClass = 'var(--bg-elevated)';
                let labelName = currentPosGroup;
                if (currentPosGroup === 'GK') { bgClass = 'var(--accent-warning)'; labelName = "ARQUERAS"; }
                if (currentPosGroup === 'DEF') { bgClass = 'var(--accent-success)'; labelName = "DEFENSORAS"; }
                if (currentPosGroup === 'MID') { bgClass = 'var(--accent-primary)'; labelName = "VOLANTES"; }
                if (currentPosGroup === 'FWD') { bgClass = 'var(--accent-danger)'; labelName = "DELANTERAS"; }

                const posPlayers = match.players.filter(p => p.positionTag === currentPosGroup);
                const activeCount = posPlayers.length; // Actually total count of players in this position
                const activeStartersCount = posPlayers.filter(p => p.isActive !== false && p.isStarter).length;

                let inputsHtml = '';
                if (currentPosGroup === 'GK') {
                    inputsHtml = `<span style="font-size:10px; opacity:0.8;">(1 Titular Obligatoria)</span>`;
                } else {
                    inputsHtml = `
                        <div style="display:flex; align-items:center; gap: 0.25rem;">
                            <label style="font-weight:normal; font-size:10px; margin:0;">CANTIDAD [</label>
                            <input type="number" class="pos-cantidad-input form-control" data-pos="${currentPosGroup}" min="0" value="${activeCount}" style="width: 30px; height: 18px; padding: 0 2px; text-align:center; font-size:11px; background:transparent; color:white; border:none; border-bottom:1px solid rgba(255,255,255,0.5); margin:0; border-radius:0;">
                            <label style="font-weight:normal; font-size:10px; margin:0;">]</label>
                        </div>
                        <span style="opacity:0.6; font-size:10px;">|</span>
                        <div style="display:flex; align-items:center; gap: 0.25rem;">
                            <label style="font-weight:normal; font-size:10px; margin:0;">TITULARES [</label>
                            <input type="number" class="pos-titulares-input form-control" data-pos="${currentPosGroup}" min="0" max="${activeCount}" value="${activeStartersCount}" style="width: 30px; height: 18px; padding: 0 2px; text-align:center; font-size:11px; background:transparent; color:var(--accent-warning); font-weight:bold; border:none; border-bottom:1px solid rgba(255,255,255,0.5); margin:0; border-radius:0;">
                            <label style="font-weight:normal; font-size:10px; margin:0;">]</label>
                        </div>
                    `;
                }

                playerRows += `
                <tr class="pos-group-row" style="background: ${bgClass}; color: white; border-top: 4px solid var(--bg-surface); border-bottom: 2px solid var(--border-color);">
                    <td colspan="8" style="padding: 6px 12px; font-weight: bold; font-size: 11px; letter-spacing: 1px; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap: 0.5rem;">
                                <span style="font-size:12px;">${labelName}</span>
                                <span style="opacity:0.6;">|</span>
                                ${inputsHtml}
                            </div>
                            <div style="display:flex; align-items:center; gap: 1rem;">
                                <span class="text-sm pos-total-mins" data-pos="${currentPosGroup}" style="opacity:0.9; font-weight:normal;"></span>
                            </div>
                        </div>
                    </td>
                </tr>`;
            }

            playerRows += `
            <tr data-id="${player.id}" class="player-row" style="${rowOpacity}">
                <td style="width:40px; text-align:center;">
                    <input type="checkbox" class="p-active" ${isActive ? 'checked' : ''} style="cursor:pointer; width:1.2rem; height:1.2rem;">
                </td>
                <td style="width:50px; text-align:center;">
                    <label class="star-toggle" title="Marcar como Titular">
                        <input type="checkbox" class="p-starter" ${player.isStarter ? 'checked' : ''} ${!isActive ? 'disabled' : ''}>
                        <i class="fa-solid fa-star icon-star"></i>
                    </label>
                </td>
                <td style="width:40px;">
                    <input type="text" class="form-control p-inline p-num" value="${player.number || ''}" style="width:100%; text-align:center; padding:2px;">
                </td>
                <td style="width:150px;">
                    <input type="text" class="form-control p-inline p-name" value="${player.name}" style="width:100%; padding:2px;">
                </td>
                <td style="width:80px;">
                    <select class="form-control p-inline p-pos" style="width:100%; padding:2px; font-size:13px;">
                        <option value="GK" ${player.positionTag === 'GK' ? 'selected' : ''}>GK</option>
                        <option value="DEF" ${player.positionTag === 'DEF' ? 'selected' : ''}>DEF</option>
                        <option value="MID" ${player.positionTag === 'MID' ? 'selected' : ''}>MID</option>
                        <option value="FWD" ${player.positionTag === 'FWD' ? 'selected' : ''}>FWD</option>
                    </select>
                </td>
                <td style="width:220px;">
                    <div style="display:flex; align-items:center; gap:0.5rem; width:100%;" title="Prioridad de Minutos (0 a 4)">
                        <input type="range" class="p-inline p-target" min="0" max="4" value="${targetVal}" style="flex:1;" data-pos="${player.positionTag}">
                    </div>
                </td>
                <td style="width:120px; text-align:center;">
                    ${player.positionTag === 'GK' ? '' : `
                    <div style="display:flex; justify-content:center; gap:0.5rem;" class="text-sm">
                        <label class="pc-icon-toggle" title="Servidora">
                            <input type="checkbox" class="p-pca" value="servidora" ${isChecked(player.pcAttackRoles, 'servidora')}>
                            <span class="icon-btn">S</span>
                        </label>
                        <label class="pc-icon-toggle" title="Paradora">
                            <input type="checkbox" class="p-pca" value="paradora" ${isChecked(player.pcAttackRoles, 'paradora')}>
                            <span class="icon-btn">P</span>
                        </label>
                        <label class="pc-icon-toggle" title="Tiradora">
                            <input type="checkbox" class="p-pca" value="tiradora" ${isChecked(player.pcAttackRoles, 'tiradora')}>
                            <span class="icon-btn">T</span>
                        </label>
                    </div>`}
                </td>
                <td style="width:120px; text-align:center;">
                    ${player.positionTag === 'GK' ? '' : `
                    <div style="display:flex; justify-content:center; gap:0.5rem;" class="text-sm">
                        <label class="pc-icon-toggle" title="Corredora">
                            <input type="checkbox" class="p-pcd" value="corredora" ${isChecked(player.pcDefenseRoles, 'corredora')}>
                            <span class="icon-btn">C</span>
                        </label>
                        <label class="pc-icon-toggle" title="Rebotera">
                            <input type="checkbox" class="p-pcd" value="rebotera" ${isChecked(player.pcDefenseRoles, 'rebotera')}>
                            <span class="icon-btn">R</span>
                        </label>
                        <label class="pc-icon-toggle" title="Poste">
                            <input type="checkbox" class="p-pcd" value="poste" ${isChecked(player.pcDefenseRoles, 'poste')}>
                            <span class="icon-btn">P</span>
                        </label>
                    </div>`}
                </td>
            </tr>
        `; `;
        });

        // Calculate conflicts
        const { conflictsHtml, hasBlockingConflict } = this.calculateConflicts(match);
        const genBtnDisabled = hasBlockingConflict ? 'disabled' : '';

        const pitchHtml = this.generatePitchHtml(players);

        return `
                <div class="mb-4" style = "display:flex; justify-content:flex-end;">
                    <div class="gap-4" style="display:flex; align-items:center; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:0.5rem;" title="Períodos a jugar">
                            <span class="text-sm text-muted">Períodos:</span>
                            <input type="number" id="cfg-periods" class="form-control" value="${config.periodsCount || 4}" min="1" max="10" style="width:60px; text-align:center; padding:4px;">
                        </div>
                        <div style="display:flex; align-items:center; gap:0.5rem;" title="Minutos de reloj ininterrumpido por período">
                            <span class="text-sm text-muted">Min/Per:</span>
                            <input type="number" id="cfg-mins" class="form-control" value="${config.minsPerPeriod || 15}" min="5" max="45" style="width:60px; text-align:center; padding:4px;">
                        </div>
                        <button class="btn btn-warning" id="btn-reset-mins" title="Restablecer todos los jugadores al máximo/mínimo"><i class="fa-solid fa-rotate-left"></i> Restablecer Ajustes</button>
                        <button class="btn btn-success" id="auto-gen-from-team" ${genBtnDisabled}><i class="fa-solid fa-wand-magic-sparkles"></i> Generar Plan de Partido</button>
                    </div>
            </div>

            <div class="players-grid-layout">
                <div class="table-container-side">
                    <div class="card table-container mb-6" style="padding: 0;">
                        <table class="table table-sm" style="margin:0; font-size:13px; width: 100%;">
                            <thead style="position: sticky; top: 0; z-index: 10;">
                                <tr>
                                    <th style="padding:4px;"><div style="font-size:10px; text-align:center;">JUEGA</div></th>
                                    <th style="padding:4px;"><div style="font-size:10px; text-align:center;">TITULAR</div></th>
                                    <th style="padding:4px;">Nº</th>
                                    <th style="padding:4px;">Nombre</th>
                                    <th style="padding:4px;">Puesto</th>
                                    <th style="padding:4px;">Minutos a Jugar por Cuarto</th>
                                    <th style="padding:4px;">CC Ataque (T/P/S)</th>
                                    <th style="padding:4px;">CC Defensa (C/R/P)</th>
                                </tr>
                            </thead>
                            <tbody id="players-tbody">
                                ${players.length ? playerRows : '<tr><td colspan="8" class="text-muted" style="text-align:center; padding:2rem;">No hay jugadoras. Añade una nueva jugadora para empezar.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="card bg-elevated" style="border-left: 4px solid var(--accent-primary);">
                        <h4 style="margin-bottom:0.5rem;"><i class="fa-solid fa-clipboard-check"></i> Análisis Preliminar</h4>
                        <div id="analysis-warnings-container">${conflictsHtml}</div>
                    </div>
                </div>
                <div class="pitch-side">
                    <div class="card" style="position:sticky; top:1rem;">
                        <h4 style="text-align:center; margin:0;">Táctica en Cancha</h4>
                        <p class="text-muted text-sm" style="text-align:center;">En base a titulares elegidas</p>
                        <div id="pitch-container-wrapper">
                            ${pitchHtml}
                        </div>
                    </div>
                </div>
            </div>
            
            <style>
                .custom-checkbox { margin-right: 4px; display: inline-flex; align-items: center; gap:2px; cursor:pointer;}
                .player-row:hover { background: var(--bg-elevated); }
                .p-inline { background: transparent; border: 1px solid transparent; color: var(--text-main); transition: border 0.2s;}
                .p-inline:focus, .p-inline:hover { border-color: var(--border-color); background: var(--bg-dark); }
                .players-grid-layout { display: grid; gap: 1.5rem; grid-template-columns: 1fr; }
                @media(max-width: 900px) {
                    .pitch-side { display: none !important; }
                    /* Responsive Table on Mobile */
                    .table-container-side table, .table-container-side tbody { display: block; width: 100%; border:none; }
                    .table-container-side thead { display: none; }
                    .table-container-side .player-row {
                        display: grid;
                        grid-template-columns: 40px 50px 40px 1fr 80px;
                        grid-template-areas: 
                            "act str num name pos"
                            "sld sld sld sld sld"
                            "pca pca pca pcd pcd";
                        gap: 8px;
                        padding: 12px 8px !important;
                        margin-bottom: 8px;
                        border: 1px solid var(--border-color);
                        border-radius: var(--radius-md);
                        background: var(--bg-surface);
                    }
                    .table-container-side .player-row td {
                        display: flex !important;
                        align-items: center;
                        width: 100% !important;
                        padding: 0 !important;
                        border: none !important;
                    }
                    .table-container-side .player-row td:nth-child(1) { grid-area: act; justify-content: center; }
                    .table-container-side .player-row td:nth-child(2) { grid-area: str; justify-content: center; }
                    .table-container-side .player-row td:nth-child(3) { grid-area: num; }
                    .table-container-side .player-row td:nth-child(4) { grid-area: name; }
                    .table-container-side .player-row td:nth-child(5) { grid-area: pos; }
                    .table-container-side .player-row td:nth-child(6) { grid-area: sld; padding-top: 8px !important; }
                    .table-container-side .player-row td:nth-child(7) { grid-area: pca; padding-top: 8px !important; justify-content: center; }
                    .table-container-side .player-row td:nth-child(8) { grid-area: pcd; padding-top: 8px !important; justify-content: center; }
                    
                    /* Grouping Headers */
                    .table-container-side tr.pos-group-row {
                        display: block;
                        margin-bottom: 8px;
                        border-radius: var(--radius-md);
                    }
                    .table-container-side tr.pos-group-row td {
                        display: block !important;
                        width: 100% !important;
                        padding: 12px 8px !important;
                        border: none !important;
                    }
                    .table-container-side tr.pos-group-row td > div {
                        flex-direction: column;
                        align-items: flex-start !important;
                        gap: 8px;
                    }
                    .table-container-side tr.pos-group-row td > div > div:first-child {
                        width: 100%;
                        justify-content: space-between !important;
                    }
                    .pos-total-mins { margin-top: 4px; display:block; }
                }
                @media(min-width: 1000px) {
                    .players-grid-layout { grid-template-columns: 3fr 1fr; }
                    .pitch-side { display: block !important; }
                }
                .dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
                .table-sm th, .table-sm td { padding: 4px 6px !important; }
            </style>
            `;
    }

    generatePitchHtml(players) {
        let matchStartersDetails = { GK: [], DEF: [], MID: [], FWD: [] };
        let matchSubsDetails = { GK: [], DEF: [], MID: [], FWD: [] };

        players.forEach(p => {
            if (p.isActive !== false) {
                if (p.isStarter) {
                    if (matchStartersDetails[p.positionTag]) {
                        matchStartersDetails[p.positionTag].push(p.name || `Jugador ${ p.number } `);
                    }
                } else {
                    if (matchSubsDetails[p.positionTag]) {
                        matchSubsDetails[p.positionTag].push(p.name || `Jugador ${ p.number } `);
                    }
                }
            }
        });

        const renderPitchLine = (names, color) => {
            if (!names || names.length === 0) return '';
            return names.map(n => `
                <div style = "display:flex; flex-direction:column; align-items:center;">
                    <div class="dot bg-${color}" style="width:12px; height:12px; border-radius:50%; margin-bottom:2px; box-shadow:0 0 0 1px white;"></div>
                    <span style="color:white; font-size:10px; text-shadow:1px 1px 2px black; font-weight:bold; max-width:60px; text-align:center; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</span>
                </div>
                `).join('');
        };

        const renderSubsZone = (names, title, colorClass) => {
            if (!names || names.length === 0) return '';
            const namesHtml = names.map(n => `<div style = "font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" class="text-${colorClass}"> ${ n }</div> `).join('');
            return `
                <div style = "margin-bottom: 8px;">
                    <div style="font-size:10px; font-weight:bold; color:var(--text-muted); border-bottom:1px solid var(--border-color); padding-bottom:2px; margin-bottom:4px;">${title}</div>
                    ${ namesHtml }
                </div>
                `;
        };

        return `
                <div style = "display:flex; gap: 1rem; align-items:flex-start;">
                <!--Pitch-->
                <div class="mini-pitch" style="flex:1; background:#2e7d32; border: 2px solid white; border-radius: 4px; height: 350px; position: relative; padding: 10px; display: flex; flex-direction: column; justify-content: space-between; margin-top:1rem; overflow:hidden;">
                    <!--23m lines-->
                    <div style="border-top: 1px solid rgba(255,255,255,0.4); border-bottom: 1px solid rgba(255,255,255,0.4); position: absolute; top:25%; bottom:25%; left:0; right:0; z-index:0;"></div>
                    <!--center line-->
                    <div style="border-bottom: 2px solid white; position: absolute; top:50%; left:0; right:0; z-index:0;"></div>
                    <!--shooting circles(D)-->
                    <div style="border: 1px solid white; border-radius: 0 0 50% 50%; width: 40%; height: 15%; position:absolute; top:0; left:30%; z-index:0; border-top:none; border-bottom:2px solid white;"></div>
                    <div style="border: 1px solid white; border-radius: 50% 50% 0 0; width: 40%; height: 15%; position:absolute; bottom:0; left:30%; z-index:0; border-bottom:none; border-top:2px solid white;"></div>
                    
                    <div style="display:flex; justify-content:space-around; z-index:1; padding-top:20px;">
                        ${renderPitchLine(matchStartersDetails.FWD, 'danger')}
                    </div>
                    <div style="display:flex; justify-content:space-around; z-index:1;">
                        ${renderPitchLine(matchStartersDetails.MID, 'primary')}
                    </div>
                    <div style="display:flex; justify-content:space-around; z-index:1;">
                        ${renderPitchLine(matchStartersDetails.DEF, 'success')}
                    </div>
                    <div style="display:flex; justify-content:space-around; z-index:1; padding-bottom:10px;">
                        ${renderPitchLine(matchStartersDetails.GK, 'warning')}
                    </div>
                </div>

                <!--Substitutes Side Panel-- >
                <div style="width: 100px; margin-top:1rem; padding-left:0.5rem; border-left:1px dashed var(--border-color);">
                    <div style="font-size:12px; font-weight:bold; margin-bottom:8px;">Suplentes</div>
                    ${renderSubsZone(matchSubsDetails.FWD, 'DEL', 'danger')}
                    ${renderSubsZone(matchSubsDetails.MID, 'VOL', 'primary')}
                    ${renderSubsZone(matchSubsDetails.DEF, 'DEF', 'success')}
                    ${renderSubsZone(matchSubsDetails.GK, 'ARQ', 'warning')}
                </div>
            </div>
                `;
    }

    updatePitch(match) {
        const container = document.getElementById('pitch-container-wrapper');
        if (container) {
            container.innerHTML = this.generatePitchHtml(match.players);
        }
    }

    calculateConflicts(match) {
        const config = match.config;
        const totalMatchMinutes = (config.minsPerPeriod || 15) * (config.periodsCount || 4);
        const reqOnField = config.onFieldCount || 11;

        let conflictsHtml = '';
        let totalTargetMinutes = 0;
        let startersCount = 0;

        match.players.forEach(p => {
            if (p.isActive !== false) {
                if (p.isStarter) startersCount++;
                const targetScore = p.playTarget ?? (p.isStarter ? 4 : 0);
                const fraction = targetScore / 4;
                const tv = fraction * totalMatchMinutes;
                totalTargetMinutes += tv;
            }
        });

        const targetNeeded = reqOnField * totalMatchMinutes;
        const diff = totalTargetMinutes - targetNeeded;
        const gkStartersCount = match.players.filter(p => p.isActive !== false && p.isStarter && p.positionTag === 'GK').length;

        let hasBlockingConflict = false;

        if (startersCount !== reqOnField) {
            hasBlockingConflict = true;
            conflictsHtml += `<div class="text-danger mb-2" style = "font-size: 1.1rem; padding: 0.5rem; background: rgba(239, 68, 68, 0.1); border-radius: 4px; border: 1px solid var(--accent-danger);"> <i class="fa-solid fa-ban"></i> Acción Requerida: Debes elegir exactamente <b> ${ reqOnField } Titulares</b> en total.Tienes ${ startersCount } seleccionadas.</div> `;
        }

        if (gkStartersCount !== 1) {
            hasBlockingConflict = true;
            conflictsHtml += `<div class="text-danger mb-2" style = "font-size: 1.1rem; padding: 0.5rem; background: rgba(239, 68, 68, 0.1); border-radius: 4px; border: 1px solid var(--accent-danger);"> <i class="fa-solid fa-ban"></i> Acción Requerida: Tienes ${ gkStartersCount } Arqueras titulares.Debe haber <b> exactamente 1</b>.</div> `;
        }

        if (Math.abs(diff) > 2) {
            const isOver = diff > 0;
            conflictsHtml += `<div class="text-${isOver ? 'warning' : 'danger'} mb-2">
                <i class="fa-solid fa-scale-unbalanced"></i> Tiempos desbalanceados: Las barras suman <b> ${ Math.round(totalTargetMinutes) } min</b> en el partido, pero en cancha hay lugar para <b> ${ targetNeeded } min</b> (${ reqOnField } jugadoras x ${ totalMatchMinutes }m).${ isOver ? 'Sobran minutos, algunas jugarán menos de lo pedido.' : 'Faltan minutos, algunas jugarán más de lo pedido.' }
            </div> `;
        }

        if (!conflictsHtml) {
            conflictsHtml = `<div class="text-success"> <i class="fa-solid fa-check-circle"></i> Todo se ve balanceado.Táctica ${ reqOnField } titulares elegida correctamente.</div> `;
        }

        return { conflictsHtml, hasBlockingConflict };
    }

    updateWarnings(match) {
        const container = document.getElementById('analysis-warnings-container');
        const btn = document.getElementById('auto-gen-from-team');
        if (!container || !btn) return;

        const { conflictsHtml, hasBlockingConflict } = this.calculateConflicts(match);
        container.innerHTML = conflictsHtml;

        if (hasBlockingConflict) {
            btn.setAttribute('disabled', 'true');
        } else {
            btn.removeAttribute('disabled');
        }
    }

    // --- Config Screen ---
    renderConfig() {
        const config = window.SmartSubs.store.getCurrentMatch().config;
        if (!config) return '';

        let reqPosHtml = Object.entries(config.formationRequirements).map(([pos, count]) => `
            <div style = "flex:1">
                <label class="form-label">${pos}</label>
                <input type="number" class="form-control req-pos-input" data-pos="${pos}" value="${count}" min="0">
            </div>
        `).join('');

        return `
            <div class="flex-between mb-4">
                <h2>Configuración del Partido</h2>
                <div>
                    <button class="btn btn-outline" onclick="window.SmartSubs.UI.navigate('players')" style="margin-right:0.5rem;">Volver</button>
                    <button class="btn btn-success" id="save-config"><i class="fa-solid fa-save"></i> Guardar</button>
                </div>
            </div>
            
            <div class="card mb-4">
                <h3 class="mb-4">Estructura y Tiempos</h3>
                <div style="display:flex; gap:1rem;">
                    <div style="flex:1">
                        <label class="form-label">Minutos Totales del Partido</label>
                        <input type="number" id="c-total-min" class="form-control" value="${config.totalMinutes}">
                    </div>
                    <div style="flex:1">
                        <label class="form-label">Minutos por Bloque</label>
                        <input type="number" id="c-block-min" class="form-control" value="${config.blockMinutes}">
                    </div>
                    <div style="flex:1">
                        <label class="form-label">Jugadoras en Cancha</label>
                        <input type="number" id="c-on-field" class="form-control" value="${config.onFieldCount}" disabled>
                    </div>
                </div>
            </div>

            <div class="card mb-4">
                <h3 class="mb-2">Formación Requerida (Suma debe ser 11)</h3>
                <p class="text-muted text-sm mb-4">Define cuántas jugadoras de cada posición deben estar obligatoriamente en cancha en cada bloque normal.</p>
                <div style="display:flex; gap:1rem;" id="req-pos-container">
                    ${reqPosHtml}
                </div>
            </div>
            
            <div class="card mb-4">
                <h3 class="mb-4">Prioridades del Algoritmo (Pesos)</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                    <div>
                        <label class="form-label">Prioridad Restricciones Duras (Roles) (0-100)</label>
                        <input type="number" id="w-hard" class="form-control" value="${config.priorities.weightHardRoles}">
                    </div>
                    <div>
                        <label class="form-label">Penalizar exceso de Stint (0-100)</label>
                        <input type="number" id="w-stint" class="form-control" value="${config.priorities.weightMaxStint}">
                    </div>
                    <div>
                        <label class="form-label">Priorizar Equidad (Minutos objetivo) (0-100)</label>
                        <input type="number" id="w-equity" class="form-control" value="${config.priorities.weightEquity}">
                    </div>
                    <div>
                        <label class="form-label">Penalizar exceso de Descanso (0-100)</label>
                        <input type="number" id="w-rest" class="form-control" value="${config.priorities.weightMaxRest}">
                    </div>
                </div>
                
                <div class="mt-4 flex-between border-top" style="padding-top:1rem; border-top:1px solid var(--border-color);">
                    <div>
                        <strong>Modo Estricto</strong>
                        <p class="text-muted text-sm">Si no se puede cumplir la formación, el algoritmo fallará en lugar de relajar las reglas.</p>
                    </div>
                    <label class="switch" style="display:flex; align-items:center; gap:0.5rem;">
                        <input type="checkbox" id="c-strict" ${config.strictMode ? 'checked' : ''} style="width:1.25rem; height:1.25rem;">
                        Activar
                    </label>
                </div>
            </div>
        `;
    }

    // --- Plan Screen ---
    renderPlan() {
        const match = window.SmartSubs.store.getCurrentMatch();
        const plan = match.plan;

        if (!plan || !plan.blocks || plan.blocks.length === 0) {
            return `
            <div class="flex-between mb-4">
                <h2>Plan de Rotación</h2>
            </div>
            <div class="card" style="text-align:center; padding: 3rem;">
                <i class="fa-solid fa-clipboard-question text-muted" style="font-size:3rem; margin-bottom:1rem; display:block;"></i>
                <p class="text-muted">Aún no se ha generado un plan para este partido.</p>
                <button class="btn btn-primary mt-2" onclick="window.SmartSubs.UI.navigate('players')">Ir a Vista de Equipo</button>
            </div>
        `;
        }

        window.SmartSubs.UI.currentQuarter = window.SmartSubs.UI.currentQuarter || 1;
        const q = window.SmartSubs.UI.currentQuarter;
        const qLen = match.config.minsPerPeriod || 15;
        const qBlocks = plan.blocks.slice((q - 1) * qLen, q * qLen);

        const activePlayers = match.players.filter(p => p.isActive !== false);

        // Pre-calculate whole-match stats for "Jugado" column
        const stats = {};
        activePlayers.forEach(p => {
            let played = 0;
            plan.blocks.forEach(b => {
                if (b.onFieldPlayerIds.includes(p.id)) played += b.duration;
            });
            stats[p.id] = { played };
        });

        const positions = [
            { id: 'GK', name: 'ARQUERAS', color: 'warning' },
            { id: 'DEF', name: 'DEFENSORAS', color: 'success' },
            { id: 'MID', name: 'VOLANTES', color: 'primary' },
            { id: 'FWD', name: 'DELANTERAS', color: 'danger' }
        ];

        let tablesHtml = '';

        positions.forEach(posGroup => {
            const posPlayers = activePlayers.filter(p => p.positionTag === posGroup.id);
            if (posPlayers.length === 0) return;

            // Table headers (15 down to 1)
            let headersHtml = '';
            for (let min = 1; min <= qLen; min++) {
                headersHtml += `<th style = "width:30px; text-align:center; padding:0.25rem;"> ${ min }</th> `;
            }

            let rowsHtml = '';
            posPlayers.forEach(p => {
                let s = stats[p.id];

                let cellsHtml = '';
                let currentStintMins = -1; // -1 means off field

                qBlocks.forEach((b, i) => {
                    const isPlaying = b.onFieldPlayerIds.includes(p.id);

                    if (isPlaying) {
                        currentStintMins++;
                        cellsHtml += `<td class="bg-${posGroup.color} text-white" style = "text-align:center; padding:0.25rem; border: 1px solid var(--border-color); font-weight:bold; font-size:12px;"> ${ currentStintMins }</td> `;
                    } else {
                        currentStintMins = -1;
                        cellsHtml += `<td class="bg-white" style = "text-align:center; padding:0.25rem; border: 1px solid var(--border-color); font-weight:bold; font-size:12px;"></td> `;
                    }
                });

                rowsHtml += `
            <tr>
                        <td style="font-weight:bold; width:150px; border: 1px solid var(--border-color); padding:0.25rem 0.5rem; background:var(--bg-card);">${p.name}</td>
                        <td style="text-align:center; font-weight:bold; width:70px; border: 1px solid var(--border-color); padding:0.25rem;">${s.played}</td>
                        ${ cellsHtml }
                    </tr>
            `;
            });

            tablesHtml += `
            <div class="mb-6">
                    <h4 style="margin-bottom:0.25rem; text-transform:uppercase; font-size: 14px;">${posGroup.name}</h4>
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse: collapse; background:white; color:black; font-family:monospace;">
                            <thead style="background:#e0e0e0;">
                                <tr>
                                    <th style="text-align:left; padding:0.25rem 0.5rem;">Jugadora</th>
                                    <th style="padding:0.25rem; font-size:10px;">Jugado</th>
                                    ${headersHtml}
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        // Quarter Selector Tabs
        const btnClass = (quarter) => q === quarter ? 'btn btn-primary' : 'btn btn-outline';

        // Build dynamic quarter buttons based on active config periods
        let quarterBtnsHtml = '';
        const numPeriods = match.config.periodsCount || 4;
        for (let qNum = 1; qNum <= numPeriods; qNum++) {
            const startStr = (qNum - 1) * qLen + 1;
            const endStr = qNum * qLen;
            quarterBtnsHtml += `<button class="${btnClass(qNum)}" onclick = "window.SmartSubs.UI.currentQuarter=${qNum}; window.SmartSubs.UI.render();"> P${ qNum } (Min ${ startStr } - ${ endStr })</button> `;
        }

        return `
            <style>
                .bg - light - green { background - color: #d4f7d4; color: #aaa; }
                .bg - white { background - color: #ffffff; color: transparent; }
            </style>
            
            <div class="flex-between mb-4">
                <h2>Línea de Tiempo (Excel)</h2>
                <button class="btn btn-outline" data-action="export-csv"><i class="fa-solid fa-download"></i> Exportar CSV</button>
            </div>

            <div class="mb-4" style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                ${quarterBtnsHtml}
            </div>

            <div class="card" style="padding: 1rem;">
                ${tablesHtml}
            </div>
            
            ${ this.renderEditBlockModal() }
        `;
    }

    renderEditBlockModal() {
        if (this.editingBlockIndex === null) return '';

        const match = window.SmartSubs.store.getCurrentMatch();
        const block = match.plan.blocks[this.editingBlockIndex];
        const allPlayers = match.players;

        const onField = allPlayers.filter(p => block.onFieldPlayerIds.includes(p.id));
        const onBench = allPlayers.filter(p => !block.onFieldPlayerIds.includes(p.id));

        const renderPlayerRow = (p, isField) => {
            const isLocked = block.lockedPlayerIds.includes(p.id);
            const actionBtn = isField
                ? `<button class="btn btn-sm btn-outline btn-icon" title = "Mandar al banco" onclick = "window.SmartSubs.UI.swapPlayer('${p.id}', false)"> <i class="fa-solid fa-arrow-down text-danger"></i></button> `
                : `<button class="btn btn-sm btn-outline btn-icon" title = "Meter a la cancha" onclick = "window.SmartSubs.UI.swapPlayer('${p.id}', true)"> <i class="fa-solid fa-arrow-up text-success"></i></button> `;

            const lockBtn = isField
                ? `<button class="btn btn-sm btn-icon ${isLocked ? 'btn-primary' : 'btn-outline'}" title = "${isLocked ? 'Desbloquear' : 'Bloquear'}" onclick = "window.SmartSubs.UI.toggleLockPlayer('${p.id}')">
            <i class="fa-solid ${isLocked ? 'fa-lock' : 'fa-lock-open'}"></i>
                   </button> `
                : '';

            return `
            <div style = "display:flex; justify-content:space-between; align-items:center; padding:0.5rem; border:1px solid var(--border-color); border-radius:4px; margin-bottom:4px; background:var(--bg-dark);">
                    <span><span class="badge badge-gray text-xs" style="margin-right:8px;">${p.positionTag}</span> <b>${p.number} ${p.name}</b></span>
                    <div style="display:flex; gap:0.5rem;">
                        ${lockBtn}
                        ${actionBtn}
                    </div>
                </div>
            `;
        };

        return `
            <div style = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); z-index:100; display:flex; align-items:center; justify-content:center; padding:2rem;">
                <div class="card" style="width:100%; max-width:800px; max-height:80vh; overflow-y:auto; position:relative;">
                    <button class="btn btn-icon" style="position:absolute; top:1rem; right:1rem;" onclick="window.SmartSubs.UI.closeEditModal()">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                    <h3 class="mb-4">Ajustar Bloque ${this.editingBlockIndex + 1} (${block.startMinute}' - ${block.endMinute}')</h3>
                    <p class="text-sm text-muted mb-4">Puedes fijar (lock) jugadoras para que el algoritmo no las toque, o forzar cambios ahora.</p>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:2rem;">
                        <div>
                            <h4 class="mb-2 text-success"><i class="fa-solid fa-people-group"></i> En Cancha (${onField.length})</h4>
                            <div style="margin-bottom:1rem;">
                                ${onField.map(p => renderPlayerRow(p, true)).join('')}
                            </div>
                        </div>
                        <div>
                            <h4 class="mb-2 text-warning"><i class="fa-solid fa-chair"></i> En el Banco (${onBench.length})</h4>
                            <div>
                                ${onBench.map(p => renderPlayerRow(p, false)).join('')}
                            </div>
                        </div>
                    </div>

                    <div style="margin-top:2rem; padding-top:1rem; border-top:1px solid var(--border-color); display:flex; justify-content:space-between;">
                        <button class="btn btn-outline" onclick="window.SmartSubs.UI.closeEditModal()">Cerrar</button>
                        <button class="btn btn-primary" onclick="window.SmartSubs.UI.recalcFromHere()"><i class="fa-solid fa-rotate-right"></i> Recalcular Automáticamente a partir de aquí</button>
                    </div>
                </div>
            </div>
            `;
    }

    // --- Events & Routing ---

    attachNavbarEvents() {
        if (this.currentRoute === 'home') this.attachHomeEvents();

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const route = e.currentTarget.dataset.route;
                if (route) {
                    this.navigate(route);
                }
            });
        });
    }

    attachActiveScreenEvents() {
        if (this.currentRoute === 'players') this.attachPlayersEvents();
        if (this.currentRoute === 'plan') this.attachPlanEvents();
    }

    attachPlayersEvents() {
        const resetBtn = document.getElementById('btn-reset-mins');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (!confirm("¿Seguro que quieres borrar todos los ajustes manuales de prioridad y volver a asignar prioridad máxima a las titulares y 0 a las suplentes?")) return;
                const match = window.SmartSubs.store.getCurrentMatch();
                match.players.forEach(p => {
                    p.playTarget = p.isStarter ? 4 : 0;
                });
                window.SmartSubs.store.saveCurrentMatch();
                this.render();
            });
        }

        const tbody = document.getElementById('players-tbody');
        if (!tbody) return;

        let timeoutId;
        const saveAllInline = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                const match = window.SmartSubs.store.getCurrentMatch();
                let hasChanges = false;

                document.querySelectorAll('.player-row').forEach(row => {
                    const id = row.dataset.id;
                    const name = row.querySelector('.p-name').value;
                    const number = row.querySelector('.p-num').value;
                    const pos = row.querySelector('.p-pos').value;
                    const target = parseInt(row.querySelector('.p-target').value, 10);

                    const pcAttCount = Array.from(row.querySelectorAll('.p-pca:checked')).map(cb => cb.value);
                    const pcDefCount = Array.from(row.querySelectorAll('.p-pcd:checked')).map(cb => cb.value);
                    const isActive = row.querySelector('.p-active').checked;
                    const isStarter = row.querySelector('.p-starter').checked;

                    const pIdx = match.players.findIndex(p => p.id === id);
                    if (pIdx > -1) {
                        const p = match.players[pIdx];
                        if (p.name !== name || p.number !== number || p.positionTag !== pos || (p.playTarget ?? 50) !== target ||
                            JSON.stringify(p.pcAttackRoles) !== JSON.stringify(pcAttCount) ||
                            JSON.stringify(p.pcDefenseRoles) !== JSON.stringify(pcDefCount) ||
                            p.isActive !== isActive || p.isStarter !== isStarter
                        ) {
                            p.name = name;
                            p.number = number;
                            p.positionTag = pos;
                            p.playTarget = target;
                            p.pcAttackRoles = pcAttCount;
                            p.pcDefenseRoles = pcDefCount;
                            p.isActive = isActive;
                            p.isStarter = isStarter;
                            hasChanges = true;
                        }
                    }
                });

                if (hasChanges) {
                    window.SmartSubs.store.saveCurrentMatch();
                    // Update warnings without full render to maintain scroll
                    this.updateWarnings(match);
                }
            }, 300);
        };

        tbody.addEventListener('input', (e) => {
            if (e.target.classList.contains('p-target')) {
                const slider = e.target;
                const tr = slider.closest('tr');
                const newVal = parseInt(slider.value, 10);

                const match = window.SmartSubs.store.getCurrentMatch();
                const pId = tr.dataset.id;
                const pData = match.players.find(p => p.id === pId);

                // Update the changed player internally first
                pData.playTarget = newVal;

                saveAllInline();
            }
        });

        tbody.addEventListener('change', (e) => {
            if (e.target.classList.contains('pos-cantidad-input')) {
                const pos = e.target.dataset.pos;
                const newCount = parseInt(e.target.value, 10) || 0;
                const match = window.SmartSubs.store.getCurrentMatch();
                const currentCount = match.players.filter(p => p.positionTag === pos).length;

                if (newCount > currentCount) {
                    window.SmartSubs.store.addPlayersByPosition(pos, newCount - currentCount);
                } else if (newCount <currentCount) {
                    window.SmartSubs.store.removePlayersByPosition(pos, currentCount - newCount);
                }
                this.render();
                return;
            }

            if (e.target.classList.contains('pos-titulares-input')) {
                const pos = e.target.dataset.pos;
                const count = parseInt(e.target.value, 10) || 0;

                const match = window.SmartSubs.store.getCurrentMatch();
                // Find all active players for this position
                const activePosPlayers = match.players.filter(p => p.isActive !== false && p.positionTag === pos);

                // Assign starters
                activePosPlayers.forEach((p, idx) => {
                    const shouldStart = idx <count;
                    p.isStarter = shouldStart;
                    p.playTarget = shouldStart ? 3 : 1; // 75% titular, 25% suplente
                });

                window.SmartSubs.store.saveCurrentMatch();
                this.render(); // Full re-render needed to re-paint the stars and slider values
                return;
            }

            if (e.target.classList.contains('p-starter')) {
                // Instantly apply visual re-render for UI and reset logic for minutes
                const match = window.SmartSubs.store.getCurrentMatch();

                // Save current DOM state instantly
                document.querySelectorAll('.player-row').forEach(row => {
                    const id = row.dataset.id;
                    const pIdx = match.players.findIndex(p => p.id === id);
                    if (pIdx > -1) {
                        const p = match.players[pIdx];
                        p.name = row.querySelector('.p-name').value;
                        p.number = row.querySelector('.p-num').value;
                        p.positionTag = row.querySelector('.p-pos').value;
                        p.pcAttackRoles = Array.from(row.querySelectorAll('.p-pca:checked')).map(cb => cb.value);
                        p.pcDefenseRoles = Array.from(row.querySelectorAll('.p-pcd:checked')).map(cb => cb.value);
                        p.isActive = row.querySelector('.p-active').checked;

                        const wasStarter = p.isStarter;
                        const isStarterNow = row.querySelector('.p-starter').checked;

                        // If toggled
                        if (wasStarter !== isStarterNow) {
                            p.isStarter = isStarterNow;
                            // Default reset logic: titulars 75% (3), bench 25% (1). Except GK: 100% (4), 0% (0)
                            if (p.positionTag === 'GK') {
                                p.playTarget = isStarterNow ? 4 : 0;
                            } else {
                                p.playTarget = isStarterNow ? 3 : 1;
                            }

                            // GK Rule: strictly uncheck other gks if this one is checked
                            if (p.positionTag === 'GK' && isStarterNow) {
                                match.players.forEach(otherP => {
                                    if (otherP.positionTag === 'GK' && otherP.id !== p.id && otherP.isStarter) {
                                        otherP.isStarter = false;
                                        otherP.playTarget = 0;
                                        // Visually update the other row instantly too without full re-render
                                        const otherRow = document.querySelector(`.player - row[data - id="${otherP.id}"]`);
                                        if (otherRow) {
                                            otherRow.querySelector('.p-starter').checked = false;
                                            otherRow.querySelector('.p-target').value = 1;
                                        }
                                    }
                                });
                            }

                            // Rehydrate UI locally so we don't need a full render of the table
                            row.querySelector('.p-target').value = p.playTarget;
                        }
                    }
                });
                window.SmartSubs.store.saveCurrentMatch();
                this.updatePitch(match); // Re-render ONLY the pitch to maintain scroll position
                this.updateWarnings(match); // Evaluate 11 players rule and re-activate button
            } else if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'text') {
                saveAllInline();
            }
        });

        const autoGenBtn = document.getElementById('auto-gen-from-team');
        if (autoGenBtn) {
            autoGenBtn.addEventListener('click', () => {
                if (autoGenBtn.hasAttribute('disabled')) return;

                // Before generating, we force a save of the current DOM state 
                // to ensure any pending inputs that didn't fire due to debouncing are saved.
                const match = window.SmartSubs.store.getCurrentMatch();
                document.querySelectorAll('.player-row').forEach(row => {
                    const id = row.dataset.id;
                    const pIdx = match.players.findIndex(p => p.id === id);
                    if (pIdx > -1) {
                        const p = match.players[pIdx];
                        p.name = row.querySelector('.p-name').value;
                        p.number = row.querySelector('.p-num').value;
                        p.positionTag = row.querySelector('.p-pos').value;
                        p.playTarget = parseInt(row.querySelector('.p-target').value, 10);
                        p.pcAttackRoles = Array.from(row.querySelectorAll('.p-pca:checked')).map(cb => cb.value);
                        p.pcDefenseRoles = Array.from(row.querySelectorAll('.p-pcd:checked')).map(cb => cb.value);
                        p.isActive = row.querySelector('.p-active').checked;
                        p.isStarter = row.querySelector('.p-starter').checked;
                    }
                });
                window.SmartSubs.store.saveCurrentMatch();

                // Save configuration directly from inputs
                const periods = parseInt(document.getElementById('cfg-periods').value, 10) || 4;
                const minPer = parseInt(document.getElementById('cfg-mins').value, 10) || 15;
                match.config.periodsCount = periods;
                match.config.minsPerPeriod = minPer;
                match.config.totalMinutes = periods * minPer;

                // Derive formation dynamically from starters
                const starters = match.players.filter(p => p.isActive !== false && p.isStarter);
                const reqPos = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
                starters.forEach(s => {
                    reqPos[s.positionTag] = (reqPos[s.positionTag] || 0) + 1;
                });
                match.config.formationRequirements = reqPos;
                window.SmartSubs.store.updateConfig(match.config);

                const planner = new window.SmartSubs.Planner(window.SmartSubs.store);
                try {
                    const plan = planner.generatePlan();
                    if (plan) {
                        window.SmartSubs.store.updatePlan(plan);
                        this.navigate('plan');
                    } else {
                        alert("El algoritmo no pudo generar el plan. Revisa la consola o asegúrate de tener 11 jugadoras en cancha.");
                    }
                } catch (e) {
                    console.error("Error generando plan:", e);
                    alert("Hubo un error calculando el plan matemático: " + e.message);
                }
            });
        }
    }

    attachPlanEvents() {
        document.querySelectorAll('.pc-att-toggle').forEach(chk => {
            chk.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.block, 10);
                const match = window.SmartSubs.store.getCurrentMatch();
                match.plan.blocks[idx].isPCAttack = !match.plan.blocks[idx].isPCAttack;
                window.SmartSubs.store.updatePlan(match.plan);
                this.render();
            });
        });

        document.querySelectorAll('.pc-def-toggle').forEach(chk => {
            chk.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.block, 10);
                const match = window.SmartSubs.store.getCurrentMatch();
                match.plan.blocks[idx].isPCDef = !match.plan.blocks[idx].isPCDef;
                window.SmartSubs.store.updatePlan(match.plan);
                this.render();
            });
        });

        document.getElementById('btn-export')?.addEventListener('click', () => {
            const match = window.SmartSubs.store.getCurrentMatch();
            if (!match || !match.plan || !match.plan.blocks) return;

            let csv = "\uFEFFBloque;Inicio;Fin;Jugadoras en cancha\\n";
            match.plan.blocks.forEach(b => {
                const names = b.onFieldPlayerIds.map(id => {
                    const p = match.players.find(x => x.id === id);
                    return p ? p.name : '?';
                }).join(', ');
                csv += `${ b.blockIndex + 1 };${ b.startMinute };${ b.endMinute }; "${names}"\\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rotaciones - ${ match.config.matchName }.csv`;
            a.click();
        });
    }

    // Modal API invoked globally by string clicks

    openEditModal(idx) {
        this.editingBlockIndex = idx;
        this.render();
    }

    closeEditModal() {
        this.editingBlockIndex = null;
        this.render();
    }

    toggleLockPlayer(id) {
        const match = window.SmartSubs.store.getCurrentMatch();
        const block = match.plan.blocks[this.editingBlockIndex];

        if (!block.lockedPlayerIds) block.lockedPlayerIds = [];

        if (block.lockedPlayerIds.includes(id)) {
            block.lockedPlayerIds = block.lockedPlayerIds.filter(x => x !== id);
        } else {
            block.lockedPlayerIds.push(id);
        }
        window.SmartSubs.store.saveCurrentMatch();
        this.render();
    }

    swapPlayer(id, toField) {
        const match = window.SmartSubs.store.getCurrentMatch();
        const block = match.plan.blocks[this.editingBlockIndex];

        if (toField) {
            if (block.onFieldPlayerIds.length >= match.config.onFieldCount) {
                alert("La cancha ya está llena (11). Quita a una jugadora primero.");
                return;
            }
            block.onFieldPlayerIds.push(id);
        } else {
            block.onFieldPlayerIds = block.onFieldPlayerIds.filter(x => x !== id);
        }
        window.SmartSubs.store.saveCurrentMatch();
        this.render();
    }

    recalcFromHere() {
        const match = window.SmartSubs.store.getCurrentMatch();
        for (let i = 0; i <this.editingBlockIndex; i++) {
            match.plan.blocks[i].lockedPlayerIds = [...match.plan.blocks[i].onFieldPlayerIds];
        }

        const planner = new window.SmartSubs.Planner(window.SmartSubs.store);
        const plan = planner.generatePlan();
        if (plan) {
            window.SmartSubs.store.updatePlan(plan);
            this.editingBlockIndex = null;
            this.render();
        }
    }

    navigate(route) {
        this.currentRoute = route;
        this.render();
    }
}

window.SmartSubs = window.SmartSubs || {};
window.SmartSubs.UI = new UI();
