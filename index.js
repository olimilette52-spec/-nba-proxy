const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());

// ESPN — Scores NBA en live
app.get("/nba/scores", async (req, res) => {
  try {
    const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard");
    const data = await r.json();
    const games = data.events.map((e) => {
      const comp = e.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === "home");
      const away = comp.competitors.find(c => c.homeAway === "away");
      const status = comp.status;
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
      };
    });
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats NBA — moyennes de points par équipe
app.get("/nba/stats", async (req, res) => {
  try {
    const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=30");
    const data = await r.json();
    const stats = {};
    for (const team of data.sports[0].leagues[0].teams) {
      const t = team.team;
      try {
        const sr = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${t.id}/statistics`);
        const sd = await sr.json();
        const cats = sd.results?.stats?.categories || [];
        const scoring = cats.find(c => c.name === "scoring");
        const ppg = scoring?.stats?.find(s => s.name === "avgPoints")?.value || null;
        const oppCat = cats.find(c => c.name === "defensive");
        const oppg = oppCat?.stats?.find(s => s.name === "avgPoints")?.value || null;
        stats[t.abbreviation] = {
          ppg: ppg ? +parseFloat(ppg).toFixed(1) : null,
          oppg: oppg ? +parseFloat(oppg).toFixed(1) : null,
          name: t.displayName,
        };
      } catch {}
    }
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Polymarket — marchés NBA
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
