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
    const yesterday = getDateISO(-1);
    const tenDaysAgo = getDateISO(-10);

    // Matchs récents pour calculer moyennes + back-to-back
    const recentRes = await fetch(
      `${BDL}/games?seasons[]=2024&start_date=${tenDaysAgo}&end_date=${yesterday}&per_page=100`,
      { headers }
    );
    const recentData = await recentRes.json();
    const recentGames = recentData.data || [];

    // Stats codées saison 2024-25 (base fiable)
    const BASE = {
      ATL:{ppg:118.5,oppg:119.2}, BOS:{ppg:122.1,oppg:108.4}, BKN:{ppg:106.8,oppg:115.3},
      CHA:{ppg:106.2,oppg:116.8}, CHI:{ppg:111.4,oppg:113.2}, CLE:{ppg:113.8,oppg:104.6},
      DAL:{ppg:116.2,oppg:111.8}, DEN:{ppg:117.4,oppg:113.6}, DET:{ppg:108.4,oppg:117.2},
      GSW:{ppg:114.6,oppg:114.8}, GS:{ppg:114.6,oppg:114.8},
      HOU:{ppg:112.8,oppg:108.4}, IND:{ppg:122.4,oppg:119.6},
      LAC:{ppg:112.6,oppg:110.4}, LAL:{ppg:114.2,oppg:111.6},
      MEM:{ppg:113.6,oppg:112.8}, MIA:{ppg:106.4,oppg:108.2},
      MIL:{ppg:114.8,oppg:113.4}, MIN:{ppg:112.4,oppg:106.2},
      NOP:{ppg:108.6,oppg:116.4}, NO:{ppg:108.6,oppg:116.4},
      NYK:{ppg:113.2,oppg:108.6}, NY:{ppg:113.2,oppg:108.6},
      OKC:{ppg:118.4,oppg:106.2}, ORL:{ppg:108.2,oppg:104.6},
      PHI:{ppg:108.4,oppg:111.6}, PHX:{ppg:112.6,oppg:114.8},
      POR:{ppg:106.8,oppg:116.2}, SAC:{ppg:117.2,oppg:116.4},
      SAS:{ppg:108.6,oppg:114.2}, SA:{ppg:108.6,oppg:114.2},
      TOR:{ppg:106.2,oppg:114.8}, UTA:{ppg:108.4,oppg:116.6},
      UTAH:{ppg:108.4,oppg:116.6}, WAS:{ppg:104.2,oppg:118.4},
    };

    const stats = {};

    for (const [abbr, base] of Object.entries(BASE)) {
      // Forme récente — totaux des 5 derniers matchs
      const teamGames = recentGames
        .filter(g =>
          g.home_team?.abbreviation === abbr ||
          g.visitor_team?.abbreviation === abbr
        )
        .filter(g => g.status === "Final")
        .slice(-5);

      let recentPts = null;
      if (teamGames.length >= 3) {
        const totals = teamGames.map(g => (g.home_team_score || 0) + (g.visitor_team_score || 0));
        recentPts = +(totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1);
      }

      // Back-to-back
      const playedYesterday = recentGames.some(g =>
        (g.home_team?.abbreviation === abbr || g.visitor_team?.abbreviation === abbr) &&
        g.date?.slice(0, 10) === yesterday &&
        g.status === "Final"
      );

      stats[abbr] = {
        name: abbr,
        ppg: base.ppg,
        oppg: base.oppg,
        recentPts,
        backToBack: playedYesterday,
      };
    }

    res.json(stats);
  } catch (err) {
    // Fallback stats de base si API échoue
    const FALLBACK = {
      ATL:{ppg:118.5,oppg:119.2}, BOS:{ppg:122.1,oppg:108.4}, BKN:{ppg:106.8,oppg:115.3},
      CHA:{ppg:106.2,oppg:116.8}, CHI:{ppg:111.4,oppg:113.2}, CLE:{ppg:113.8,oppg:104.6},
      DAL:{ppg:116.2,oppg:111.8}, DEN:{ppg:117.4,oppg:113.6}, DET:{ppg:108.4,oppg:117.2},
      GSW:{ppg:114.6,oppg:114.8}, GS:{ppg:114.6,oppg:114.8},
      HOU:{ppg:112.8,oppg:108.4}, IND:{ppg:122.4,oppg:119.6},
      LAC:{ppg:112.6,oppg:110.4}, LAL:{ppg:114.2,oppg:111.6},
      MEM:{ppg:113.6,oppg:112.8}, MIA:{ppg:106.4,oppg:108.2},
      MIL:{ppg:114.8,oppg:113.4}, MIN:{ppg:112.4,oppg:106.2},
      NOP:{ppg:108.6,oppg:116.4}, NO:{ppg:108.6,oppg:116.4},
      NYK:{ppg:113.2,oppg:108.6}, NY:{ppg:113.2,oppg:108.6},
      OKC:{ppg:118.4,oppg:106.2}, ORL:{ppg:108.2,oppg:104.6},
      PHI:{ppg:108.4,oppg:111.6}, PHX:{ppg:112.6,oppg:114.8},
      POR:{ppg:106.8,oppg:116.2}, SAC:{ppg:117.2,oppg:116.4},
      SAS:{ppg:108.6,oppg:114.2}, SA:{ppg:108.6,oppg:114.2},
      TOR:{ppg:106.2,oppg:114.8}, UTA:{ppg:108.4,oppg:116.6},
      UTAH:{ppg:108.4,oppg:116.6}, WAS:{ppg:104.2,oppg:118.4},
    };
    const result = {};
    for (const [abbr, s] of Object.entries(FALLBACK)) {
      result[abbr] = { name: abbr, ppg: s.ppg, oppg: s.oppg, recentPts: null, backToBack: false };
    }
    res.json(result);
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
