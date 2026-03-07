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
      const odds = comp.odds?.[0];

      // Spread
      let spread = null;
      let spreadTeam = null;
      if(odds){
        spread = odds.spread || null;
        if(odds.homeTeamOdds?.favorite){
          spreadTeam = home.team.abbreviation;
          spread = odds.homeTeamOdds?.spreadOdds || odds.spread || null;
        } else if(odds.awayTeamOdds?.favorite){
          spreadTeam = away.team.abbreviation;
          spread = odds.awayTeamOdds?.spreadOdds || odds.spread || null;
        }
      }

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
        total: odds?.overUnder || null,
        spread: spread ? +parseFloat(spread).toFixed(1) : null,
        spreadTeam,
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

    const recentRes = await fetch(
      `${BDL}/games?seasons[]=2024&start_date=${tenDaysAgo}&end_date=${yesterday}&per_page=100`,
      { headers }
    );
    const recentData = await recentRes.json();
    const recentGames = recentData.data || [];

    const BASE = {
      ATL:{ppg:118.5,oppg:119.2,pace:100.2}, BOS:{ppg:122.1,oppg:108.4,pace:97.8},
      BKN:{ppg:106.8,oppg:115.3,pace:96.4}, CHA:{ppg:106.2,oppg:116.8,pace:98.1},
      CHI:{ppg:111.4,oppg:113.2,pace:97.6}, CLE:{ppg:113.8,oppg:104.6,pace:96.2},
      DAL:{ppg:116.2,oppg:111.8,pace:98.4}, DEN:{ppg:117.4,oppg:113.6,pace:99.1},
      DET:{ppg:108.4,oppg:117.2,pace:98.8}, GSW:{ppg:114.6,oppg:114.8,pace:99.4},
      GS:{ppg:114.6,oppg:114.8,pace:99.4}, HOU:{ppg:112.8,oppg:108.4,pace:99.8},
      IND:{ppg:122.4,oppg:119.6,pace:102.4}, LAC:{ppg:112.6,oppg:110.4,pace:97.2},
      LAL:{ppg:114.2,oppg:111.6,pace:98.6}, MEM:{ppg:113.6,oppg:112.8,pace:100.6},
      MIA:{ppg:106.4,oppg:108.2,pace:96.8}, MIL:{ppg:114.8,oppg:113.4,pace:99.2},
      MIN:{ppg:112.4,oppg:106.2,pace:97.4}, NOP:{ppg:108.6,oppg:116.4,pace:98.2},
      NO:{ppg:108.6,oppg:116.4,pace:98.2}, NYK:{ppg:113.2,oppg:108.6,pace:96.8},
      NY:{ppg:113.2,oppg:108.6,pace:96.8}, OKC:{ppg:118.4,oppg:106.2,pace:100.2},
      ORL:{ppg:108.2,oppg:104.6,pace:96.4}, PHI:{ppg:108.4,oppg:111.6,pace:97.2},
      PHX:{ppg:112.6,oppg:114.8,pace:99.6}, POR:{ppg:106.8,oppg:116.2,pace:98.4},
      SAC:{ppg:117.2,oppg:116.4,pace:101.2}, SAS:{ppg:108.6,oppg:114.2,pace:98.6},
      SA:{ppg:108.6,oppg:114.2,pace:98.6}, TOR:{ppg:106.2,oppg:114.8,pace:97.8},
      UTA:{ppg:108.4,oppg:116.6,pace:98.2}, UTAH:{ppg:108.4,oppg:116.6,pace:98.2},
      WAS:{ppg:104.2,oppg:118.4,pace:97.6},
    };

    const stats = {};
    for (const [abbr, base] of Object.entries(BASE)) {
      const teamGames = recentGames
        .filter(g => g.home_team?.abbreviation === abbr || g.visitor_team?.abbreviation === abbr)
        .filter(g => g.status === "Final")
        .slice(-5);

      let recentPts = null;
      if (teamGames.length >= 3) {
        const totals = teamGames.map(g => (g.home_team_score || 0) + (g.visitor_team_score || 0));
        recentPts = +(totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1);
      }

      const playedYesterday = recentGames.some(g =>
        (g.home_team?.abbreviation === abbr || g.visitor_team?.abbreviation === abbr) &&
        g.date?.slice(0, 10) === yesterday &&
        g.status === "Final"
      );

      stats[abbr] = {
        name: abbr,
        ppg: base.ppg,
        oppg: base.oppg,
        pace: base.pace,
        recentPts,
        backToBack: playedYesterday,
      };
    }

    res.json(stats);
  } catch (err) {
    const FALLBACK = {
      ATL:{ppg:118.5,oppg:119.2,pace:100.2}, BOS:{ppg:122.1,oppg:108.4,pace:97.8},
      BKN:{ppg:106.8,oppg:115.3,pace:96.4}, CHA:{ppg:106.2,oppg:116.8,pace:98.1},
      CHI:{ppg:111.4,oppg:113.2,pace:97.6}, CLE:{ppg:113.8,oppg:104.6,pace:96.2},
      DAL:{ppg:116.2,oppg:111.8,pace:98.4}, DEN:{ppg:117.4,oppg:113.6,pace:99.1},
      DET:{ppg:108.4,oppg:117.2,pace:98.8}, GSW:{ppg:114.6,oppg:114.8,pace:99.4},
      GS:{ppg:114.6,oppg:114.8,pace:99.4}, HOU:{ppg:112.8,oppg:108.4,pace:99.8},
      IND:{ppg:122.4,oppg:119.6,pace:102.4}, LAC:{ppg:112.6,oppg:110.4,pace:97.2},
      LAL:{ppg:114.2,oppg:111.6,pace:98.6}, MEM:{ppg:113.6,oppg:112.8,pace:100.6},
      MIA:{ppg:106.4,oppg:108.2,pace:96.8}, MIL:{ppg:114.8,oppg:113.4,pace:99.2},
      MIN:{ppg:112.4,oppg:106.2,pace:97.4}, NOP:{ppg:108.6,oppg:116.4,pace:98.2},
      NO:{ppg:108.6,oppg:116.4,pace:98.2}, NYK:{ppg:113.2,oppg:108.6,pace:96.8},
      NY:{ppg:113.2,oppg:108.6,pace:96.8}, OKC:{ppg:118.4,oppg:106.2,pace:100.2},
      ORL:{ppg:108.2,oppg:104.6,pace:96.4}, PHI:{ppg:108.4,oppg:111.6,pace:97.2},
      PHX:{ppg:112.6,oppg:114.8,pace:99.6}, POR:{ppg:106.8,oppg:116.2,pace:98.4},
      SAC:{ppg:117.2,oppg:116.4,pace:101.2}, SAS:{ppg:108.6,oppg:114.2,pace:98.6},
      SA:{ppg:108.6,oppg:114.2,pace:98.6}, TOR:{ppg:106.2,oppg:114.8,pace:97.8},
      UTA:{ppg:108.4,oppg:116.6,pace:98.2}, UTAH:{ppg:108.4,oppg:116.6,pace:98.2},
      WAS:{ppg:104.2,oppg:118.4,pace:97.6},
    };
    const result = {};
    for (const [abbr, s] of Object.entries(FALLBACK)) {
      result[abbr] = { name: abbr, ppg: s.ppg, oppg: s.oppg, pace: s.pace, recentPts: null, backToBack: false };
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
