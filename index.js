const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());

function getDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
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
    const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=30&enable=stats");
    const data = await r.json();
    const stats = {};
    const teams = data.sports[0].leagues[0].teams;
    for (const team of teams) {
      const t = team.team;
      const ppg = t.stats?.find(s => s.name === "avgPoints")?.value || null;
      const oppg = t.stats?.find(s => s.name === "avgPointsAgainst")?.value || null;
      stats[t.abbreviation] = {
        name: t.displayName,
        ppg: ppg ? +parseFloat(ppg).toFixed(1) : null,
        oppg: oppg ? +parseFloat(oppg).toFixed(1) : null,
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
