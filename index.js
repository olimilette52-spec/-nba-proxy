const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());

const BDL_KEY = "6b5a74ca-1929-4fcf-85c3-f618bc33b757";
const BDL = "https://api.balldontlie.io/v1";

function getDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function getDateISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

app.get("/nba/scores", async (req, res) => {
  try {
    const today = getDateStr(0);
    const tomorrow = getDateStr(1);
    const [r1, r2] = await Promise.all([
      fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`),
      fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${tomorrow}`),
    ]);
    const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
    const parseGames = (data) => (data.events || []).map((e) => {
      const comp = e.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === "home");
      const away = comp.competitors.find(c => c.homeAway === "away");
      const status = comp.status;
      const line = comp.odds?.[0];
      return {
        id: e.id,
        home: home.team.abbreviation,
        homeFull: home.team.displayName,
        away: away.team.abbreviation,
        awayFull: away.team.displayName,
        homeScore: parseInt(home.score) || 0,
        awayScore: parseInt(away.score) || 0,
        quarter: status.period || 0,
        timeLeft: status.displayClock || "0:00",
        isLive: status.type.state === "in",
        isFinished: status.type.state === "post",
        time: e.date,
        total: line?.overUnder || null,
      };
    });
    const games = [
      ...parseGames(d1).filter(g => !g.isFinished),
      ...parseGames(d2),
    ];
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/nba/stats", async (req, res) => {
  try {
    const headers = { "Authorization": BDL_KEY };

    // 1. Toutes les équipes
    const teamsRes = await fetch(`${BDL}/teams?league=nba&per_page=30`, { headers });
    const teamsData = await teamsRes.json();
    const teams = teamsData.data || [];

    // 2. Moyennes saison 2024
    const seasonRes = await fetch(`${BDL}/season_averages?season=2024&type=team`, { headers });
    const seasonData = await seasonRes.json();
    const seasonAvgs = seasonData.data || [];

    // 3. Matchs récents pour forme + back-to-back
    const yesterday = getDateISO(-1);
    const tenDaysAgo = getDateISO(-10);
    const recentRes = await fetch(`${BDL}/games?seasons[]=2024&start_date=${tenDaysAgo}&end_date=${yesterday}&per_page=100`, { headers });
    const recentData = await recentRes.json();
    const recentGames = recentData.data || [];

    const stats = {};

    for (const team of teams) {
      const abbr = team.abbreviation;
      const avg = seasonAvgs.find(a => a.team?.abbreviation === abbr);

      // Points marqués et concédés
      const ppg = avg?.pts || null;
      const oppg = avg?.opp_pts || null;
      const pace = avg?.pace || null;

      // Forme récente — 5 derniers matchs
      const teamGames = recentGames
        .filter(g => g.home_team?.abbreviation === abbr || g.visitor_team?.abbreviation === abbr)
        .filter(g => g.status === "Final")
        .slice(-5);

      let recentPts = null;
      if (teamGames.length >= 3) {
        const totals = teamGames.map(g => g.home_team_score + g.visitor_team_score);
        recentPts = +(totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1);
      }

      // Back-to-back — a joué hier ?
      const playedYesterday = recentGames.some(g =>
        (g.home_team?.abbreviation === abbr || g.visitor_team?.abbreviation === abbr) &&
        g.date?.slice(0, 10) === yesterday &&
        g.status === "Final"
      );

      stats[abbr] = {
        name: team.full_name,
        ppg: ppg ? +parseFloat(ppg).toFixed(1) : null,
        oppg: oppg ? +parseFloat(oppg).toFixed(1) : null,
        pace: pace ? +parseFloat(pace).toFixed(1) : null,
        recentPts,
        backToBack: playedYesterday,
      };
    }

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/polymarket/nba", async (req, res) => {
  try {
    const r = await fetch("https://gamma-api.polymarket.com/markets?tag=nba&limit=50&active=true");
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
