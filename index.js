const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());

// ESPN - Scores NBA en live
app.get("/nba/scores", async (req, res) => {
  try {
    const r = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
    );
    const data = await r.json();
    const games = data.events.map((e) => {
      const comp = e.competitions[0];
      const home = comp.competitors.find((t) => t.homeAway === "home");
      const away = comp.competitors.find((t) => t.homeAway === "away");
      const status = comp.status;
      return {
        id: e.id,
        home: home.team.abbreviation,
        homeFull: home.team.displayName,
        homeScore: parseInt(home.score || 0),
        away: away.team.abbreviation,
        awayFull: away.team.displayName,
        awayScore: parseInt(away.score || 0),
        quarter: status.period || 0,
        timeLeft: status.displayClock || "0:00",
        statusText: status.type.description,
        isLive: status.type.state === "in",
      };
    });
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Polymarket - Marchés NBA over/under
app.get("/polymarket/nba", async (req, res) => {
  try {
    const r = await fetch(
      "https://gamma-api.polymarket.com/markets?tag=nba&limit=50&active=true"
    );
    const data = await r.json();
    const markets = data
      .filter((m) =>
        m.question &&
        (m.question.toLowerCase().includes("over") ||
          m.question.toLowerCase().includes("under") ||
          m.question.toLowerCase().includes("total"))
      )
      .map((m) => ({
        id: m.id,
        question: m.question,
        outcomePrices: m.outcomePrices,
        outcomes: m.outcomes,
        volume: m.volume,
        endDate: m.endDate,
      }));
    res.json(markets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => res.send("NBA Proxy OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Proxy running on port", PORT));
