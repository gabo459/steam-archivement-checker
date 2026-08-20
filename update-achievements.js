const fs = require('fs');

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

if (!STEAM_API_KEY || !STEAM_ID) {
  console.error('❌ Error: Las variables STEAM_API_KEY o STEAM_ID no están configuradas.');
  process.exit(1);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al consultar ${url}`);
  return await res.json();
}

async function main() {
  console.log('🚀 Iniciando escaneo global de logros de la biblioteca...');

  try {
    // 1. Obtener todos los juegos de la biblioteca del usuario
    const gamesUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json&include_appinfo=true`;
    const gamesData = await fetchJson(gamesUrl);
    const ownedGames = gamesData.response?.games || [];

    const playedGames = ownedGames.filter(g => g.playtime_forever > 0);
    console.log(`🎮 Se encontraron ${playedGames.length} juegos jugados.`);

    const allMasterAchievements = [];
    let scannedGamesCount = 0;

    // 2. Recorrer juegos e ir extrayendo logros
      for (let i = 0; i < playedGames.length; i++) {
      const game = playedGames[i];
      showStatus(`Escaneando logros (${i + 1}/${playedGames.length}): ${game.name}...`);
    
      try {
        // Primero consultamos el esquema del juego para verificar si TIENE logros
        const schemaUrl = `${CORS_PROXY}${encodeURIComponent(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${STEAM_API_KEY}&appid=${game.appid}&l=spanish`)}`;
        const sRes = await fetch(schemaUrl);
        if (!sRes.ok) continue;
    
        const sData = await sRes.json();
        const availableAchs = sData.game?.availableGameStats?.achievements;
    
        // Si el esquema no tiene logros definidos, saltamos el juego inmediatamente
        if (!availableAchs || availableAchs.length === 0) continue;
    
        const schemaMap = {};
        availableAchs.forEach(a => { schemaMap[a.name] = a; });
    
        // Ahora que sabemos que el juego tiene logros, solicitamos los del usuario
        const playerAchsUrl = `${CORS_PROXY}${encodeURIComponent(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${game.appid}&key=${STEAM_API_KEY}&steamid=${steamId}&l=spanish`)}`;
        const pRes = await fetch(playerAchsUrl);
        if (!pRes.ok) continue;
    
        const pData = await pRes.json();
        const playerAchs = pData.playerstats?.achievements;
        if (!playerAchs || playerAchs.length === 0) continue;
    
        // Obtener porcentajes globales de rareza
        const rarityUrl = `${CORS_PROXY}${encodeURIComponent(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${game.appid}`)}`;
        const rRes = await fetch(rarityUrl);
        const rData = rRes.ok ? await rRes.json() : {};
        const globalPercentages = {};
        (rData.achievementpercentages?.achievements || []).forEach(item => {
          globalPercentages[item.name] = parseFloat(item.percent).toFixed(1);
        });
    
        playerAchs.forEach(pAch => {
          const details = schemaMap[pAch.apiname] || {};
          const pct = globalPercentages[pAch.apiname] !== undefined ? parseFloat(globalPercentages[pAch.apiname]) : 100.0;
          const unlockDate = pAch.unlocktime > 0 ? new Date(pAch.unlocktime * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
    
          allMasterAchievements.push({
            id: `${game.appid}_${pAch.apiname}`,
            gameName: game.name,
            name: details.displayName || pAch.apiname,
            description: details.description || 'Sin descripción.',
            iconUnlocked: details.icon || '',
            iconLocked: details.icongray || details.icon || '',
            unlocked: pAch.achieved === 1,
            unlockTime: unlockDate,
            globalPercent: pct
          });
        });
    
        processedGamesCount++;
      } catch (e) {
        // Ignorar errores puntuales de conexión
      }
    }

    // 3. Ordenar del MÁS RARO (menor %) al MENOS RARO
    allMasterAchievements.sort((a, b) => a.globalPercent - b.globalPercent);

    const outputData = {
      updated_at: new Date().toISOString(),
      scanned_games_count: scannedGamesCount,
      total_achievements: allMasterAchievements.length,
      achievements: allMasterAchievements
    };

    fs.writeFileSync('achievements.json', JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`✨ ¡Éxito! Guardados ${allMasterAchievements.length} logros en achievements.json.`);

  } catch (error) {
    console.error('❌ Error general durante la ejecución:', error.message);
    process.exit(1);
  }
}

main();
