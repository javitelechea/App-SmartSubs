// Main Application Bootstrapper

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize UI
    const ui = window.SmartSubs.UI;

    // 2. Setup state listeners
    window.SmartSubs.State.on('store_updated', () => {
        // We do NOT call ui.render() globally anymore. 
        // Component actions (click, edit) will call this.render() independently if needed,
        // avoiding destructive DOM rebuilds while the user is typing/interacting.
    });

    // 3. Initial Render
    // If there is a current match, go straight to plan or players
    const currentMatchId = window.SmartSubs.store.data.currentMatchId;
    if (currentMatchId) {
        const match = window.SmartSubs.store.getCurrentMatch();
        if (match && match.players && match.players.length > 0) {
            ui.navigate('players');
        } else {
            ui.navigate('home');
        }
    } else {
        ui.navigate('home');
    }
});
