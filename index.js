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

// NBA SCORES
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
      let spread = null, spreadTeam = null;
      if(odds){
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

// NBA INJURIES
app.get("/nba/injuries", async (req, res) => {
  try {
    const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries");
    const data = await r.json();
    const injuries = {};
    (data.injuries || []).forEach(team => {
      const teamName = team.team?.displayName;
      if(!teamName) return;
      const out = (team.injuries || []).filter(p => p.status === "Out" || p.status === "Doubtful");
      if(out.length > 0){
        injuries[teamName] = out.map(p => ({
          name: p.athlete?.displayName,
          status: p.status,
          detail: p.injury?.detail || "",
        }));
      }
    });
    res.json(injuries);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// NBA STATS
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
        .filter(g => g.status === "Final").slice(-5);
      let recentPts = null;
      if (teamGames.length >= 3) {
        const totals = teamGames.map(g => (g.home_team_score || 0) + (g.visitor_team_score || 0));
        recentPts = +(totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1);
      }
      const playedYesterday = recentGames.some(g =>
        (g.home_team?.abbreviation === abbr || g.visitor_team?.abbreviation === abbr) &&
        g.date?.slice(0, 10) === yesterday && g.status === "Final"
      );
      stats[abbr] = { name: abbr, ppg: base.ppg, oppg: base.oppg, pace: base.pace, recentPts, backToBack: playedYesterday };
    }
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NHL SCORES
app.get("/nhl/scores", async (req, res) => {
  try {
    const today = getDateStr(0);
    const tomorrow = getDateStr(1);
    const [r1, r2] = await Promise.all([
      fetch(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${today}`),
      fetch(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${tomorrow}`),
    ]);
    const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
    const parseGames = (data) => (data.events || []).map((e) => {
      const comp = e.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === "home");
      const away = comp.competitors.find(c => c.homeAway === "away");
      const status = comp.status;
      const odds = comp.odds?.[0];
      let puckLine = null, puckLineTeam = null;
      if(odds){
        if(odds.homeTeamOdds?.favorite){
          puckLineTeam = home.team.abbreviation;
          puckLine = -1.5;
        } else if(odds.awayTeamOdds?.favorite){
          puckLineTeam = away.team.abbreviation;
          puckLine = -1.5;
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
        period: status.period || 0,
        timeLeft: status.displayClock || "0:00",
        isLive: status.type.state === "in",
        isFinished: status.type.state === "post",
        time: e.date,
        total: odds?.overUnder || null,
        puckLine,
        puckLineTeam,
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

// NHL STATS
app.get("/nhl/stats", async (req, res) => {
  const NHL_STATS = {
    ANA:{gf:2.4,ga:3.4,pp:17.2,pk:76.4,shots:28.2}, ARI:{gf:2.6,ga:3.2,pp:18.1,pk:77.2,shots:27.8},
    BOS:{gf:3.4,ga:2.6,pp:22.4,pk:82.1,shots:32.4}, BUF:{gf:2.9,ga:3.1,pp:19.2,pk:78.4,shots:29.6},
    CGY:{gf:2.8,ga:2.9,pp:20.1,pk:79.8,shots:30.2}, CAR:{gf:3.2,ga:2.4,pp:23.1,pk:83.4,shots:33.1},
    CHI:{gf:2.3,ga:3.6,pp:16.8,pk:75.2,shots:27.4}, COL:{gf:3.6,ga:2.8,pp:24.2,pk:81.6,shots:34.2},
    CBJ:{gf:2.4,ga:3.5,pp:17.4,pk:76.8,shots:28.6}, DAL:{gf:3.1,ga:2.5,pp:21.8,pk:82.8,shots:31.8},
    DET:{gf:2.7,ga:3.0,pp:19.6,pk:78.9,shots:29.4}, EDM:{gf:3.5,ga:3.1,pp:26.4,pk:79.2,shots:33.6},
    FLA:{gf:3.4,ga:2.7,pp:22.8,pk:82.4,shots:32.8}, LAK:{gf:3.0,ga:2.6,pp:20.8,pk:81.2,shots:31.4},
    MIN:{gf:2.9,ga:2.7,pp:20.4,pk:80.6,shots:30.8}, MTL:{gf:2.6,ga:3.3,pp:18.6,pk:77.6,shots:28.4},
    NSH:{gf:2.7,ga:3.0,pp:19.8,pk:79.4,shots:29.8}, NJD:{gf:2.8,ga:2.8,pp:20.2,pk:80.2,shots:30.4},
    NYI:{gf:2.7,ga:2.9,pp:19.4,pk:80.8,shots:29.2}, NYR:{gf:3.3,ga:2.6,pp:22.6,pk:82.6,shots:32.6},
    OTT:{gf:3.0,ga:3.0,pp:20.6,pk:79.6,shots:30.6}, PHI:{gf:2.8,ga:3.1,pp:19.0,pk:78.2,shots:29.0},
    PIT:{gf:2.9,ga:3.2,pp:20.0,pk:78.6,shots:30.0}, SJS:{gf:2.2,ga:3.8,pp:15.8,pk:74.4,shots:26.8},
    SEA:{gf:2.8,ga:2.9,pp:20.2,pk:80.0,shots:30.2}, STL:{gf:2.8,ga:3.0,pp:19.6,pk:79.2,shots:29.6},
    TBL:{gf:3.2,ga:2.7,pp:22.2,pk:82.0,shots:32.2}, TOR:{gf:3.3,ga:3.0,pp:22.0,pk:80.4,shots:31.6},
    VAN:{gf:3.1,ga:2.8,pp:21.4,pk:81.4,shots:31.2}, VGK:{gf:3.2,ga:2.7,pp:22.0,pk:82.2,shots:32.0},
    WSH:{gf:3.0,ga:2.9,pp:21.0,pk:80.8,shots:30.8}, WPG:{gf:3.1,ga:2.7,pp:21.6,pk:81.8,shots:31.4},
  };
  const leagueAvgGF = 3.05;
  const adjusted = {};
  for(const [k,v] of Object.entries(NHL_STATS)){
    adjusted[k] = {
      ...v,
      gf: +(v.gf * 0.7 + leagueAvgGF * 0.3).toFixed(2),
      ga: +(v.ga * 0.7 + leagueAvgGF * 0.3).toFixed(2),
    };
  }
  res.json(adjusted);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
