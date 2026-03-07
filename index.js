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

// Stats NBA via balldontlie
app.get("/nba/stats", async (req, res) => {
  try {
    const r = await fetch("https://api.balldontlie.io/v1/teams/season_averages?season=2024", {
      headers: { "Authorization": "0" }
    });
    // Fallback — stats codées en dur saison 2024-25
    const STATS = {
      ATL:{ppg:118.5,oppg:119.2},BOS:{ppg:122.1,oppg:108.4},BKN:{ppg:106.8,oppg:115.3},
      CHA:{ppg:106.2,oppg:116.8},CHI:{ppg:111.4,oppg:113.2},CLE:{ppg:113.8,oppg:104.6},
      DAL:{ppg:116.2,oppg:111.8},DEN:{ppg:117.4,oppg:113.6},DET:{ppg:108.4,oppg:117.2},
      GSW:{ppg:114.6,oppg:114.8},HOU:{ppg:112.8,oppg:108.4},IND:{ppg:122.4,oppg:119.6},
      LAC:{ppg:112.6,oppg:110.4},LAL:{ppg:114.2,oppg:111.6},MEM:{ppg:113.6,oppg:112.8},
      MIA:{ppg:106.4,oppg:108.2},MIL:{ppg:114.8,oppg:113.4},MIN:{ppg:112.4,oppg:106.2},
      NOP:{ppg:108.6,oppg:116.4},NYK:{ppg:113.2,oppg:108.6},OKC:{ppg:118.4,oppg:106.2},
      ORL:{ppg:108.2,oppg:104.6},PHI:{ppg:108.4,oppg:111.6},PHX:{ppg:112.6,oppg:114.8},
      POR:{ppg:106.8,oppg:116.2},SAC:{ppg:117.2,oppg:116.4},SAS:{ppg:108.6,oppg:114.2},
      TOR:{ppg:106.2,oppg:114.8},UTA:{ppg:108.4,oppg:116.6},WAS:{ppg:104.2,oppg:118.4},
      NO:{ppg:108.6,oppg:116.4},SA:{ppg:108.6,oppg:114.2},GS:{ppg:114.6,oppg:114.8},
      NY:{ppg:113.2,oppg:108.6},
    };
    const result = {};
    for (const [abbr, s] of Object.entries(STATS)) {
      result[abbr] = { name: abbr, ppg: s.ppg, oppg: s.oppg };
    }
    res.json(result);
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
