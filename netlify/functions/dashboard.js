const API_KEY = "3akGADYYwdaFCipRCCWQssAgmzBHCxj6nxwwXYZdKyKRXfD3Qybq5kwfqs5GURgQ";

const BASE = "https://www.thebluealliance.com/api/v3";

async function tbaFetch(path) {
  const res = await fetch(BASE + path, {
    headers: { "X-TBA-Auth-Key": API_KEY }
  });
  if (!res.ok) throw new Error(`TBA ${path} → ${res.status}`);
  return res.json();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(epochSec) {
  return new Date(epochSec * 1000).toISOString().slice(0, 10);
}

export default async function handler(req) {
  const url = new URL(req.url);
  const weekFilter = url.searchParams.get("week") ?? "all";

  try {
    const events = await tbaFetch("/events/2026");
    const today = todayStr();

    // Pass 1: final 2 days of event window (±1 day buffer for timezone drift)
    const candidates = events.filter(e => {
      if (weekFilter !== "all" && String(e.week) !== String(weekFilter)) return false;
      const end = new Date(e.end_date + "T00:00:00Z");
      const windowStart = new Date(end);
      windowStart.setDate(windowStart.getDate() - 1);
      const windowEnd = new Date(end);
      windowEnd.setDate(windowEnd.getDate() + 1);
      windowEnd.setHours(23, 59, 59, 999);
      const now = new Date();
      return now >= windowStart && now <= windowEnd;
    });

    const output = [];

    await Promise.all(candidates.map(async e => {
      let matches = [];
      try {
        matches = await tbaFetch(`/event/${e.key}/matches/simple`);
      } catch (err) {
        console.error("matches fetch failed for", e.key, err.message);
      }

      // Pass 2: confirm a match is scheduled today
      if (matches.length > 0) {
        const hasMatchToday = matches.some(m => m.time && fmtDate(m.time) === today);
        if (!hasMatchToday) return;
      }

      // Stream — pick by day index so day 2 uses webcasts[1], etc.
      let type = "none";
      let link = "https://thebluealliance.com/event/" + e.key;
      let channel = "";
      const webcasts = (e.webcasts || []).filter(s => s.type === "youtube" || s.type === "twitch");
      if (webcasts.length > 0) {
        const eventStart = new Date(e.start_date + "T00:00:00Z");
        const msPerDay = 24 * 60 * 60 * 1000;
        const dayIndex = Math.round((new Date(today + "T00:00:00Z") - eventStart) / msPerDay);
        const streamIndex = Math.min(Math.max(dayIndex, 0), webcasts.length - 1);
        const stream = webcasts[streamIndex];
        type = stream.type;
        channel = stream.channel;
        link = stream.type === "youtube"
          ? "https://youtube.com/watch?v=" + stream.channel
          : "https://twitch.tv/" + stream.channel;
      }

      // Today's matches, next upcoming, live status
      const nowSec = Date.now() / 1000;
      const todayMatches = matches.filter(m => m.time && fmtDate(m.time) === today);
      const upcoming = todayMatches.filter(m => m.time > nowSec).sort((a, b) => a.time - b.time);
      const nextMatch = upcoming.length ? upcoming[0].key.split("_")[1].toUpperCase() : "";

      let isLive = false;
      if (todayMatches.length > 0) {
        const times = todayMatches.map(m => m.time).sort((a, b) => a - b);
        isLive = nowSec >= times[0] && nowSec <= times[times.length - 1] + 3600;
      }

      // Top 5 rankings (summary card) + full rankings (expanded panel)
      let rankings = [];
      let fullRankings = [];
      try {
        const rankData = await tbaFetch(`/event/${e.key}/rankings`);
        if (rankData?.rankings) {
          const mapped = rankData.rankings.map(r => ({
            rank: r.rank,
            team: r.team_key.replace("frc", ""),
            wins: r.record?.wins ?? 0,
            losses: r.record?.losses ?? 0,
            ties: r.record?.ties ?? 0
          }));
          rankings = mapped.slice(0, 5);
          fullRankings = mapped;
        }
      } catch (err) {
        console.error("rankings fetch failed for", e.key, err.message);
      }

      // 10 most recent completed matches
      let recentMatches = [];
      try {
        const completed = matches
          .filter(m => m.alliances && m.alliances.red.score !== null && m.alliances.red.score >= 0)
          .sort((a, b) => (b.time || 0) - (a.time || 0))
          .slice(0, 10);

        recentMatches = completed.map(m => {
          const redScore  = m.alliances.red.score;
          const blueScore = m.alliances.blue.score;
          const winner = redScore > blueScore ? "red" : blueScore > redScore ? "blue" : "tie";
          return {
            key: m.key.split("_")[1].toUpperCase(),
            redScore,
            blueScore,
            redTeams:  m.alliances.red.team_keys.map(t => t.replace("frc", "")),
            blueTeams: m.alliances.blue.team_keys.map(t => t.replace("frc", "")),
            winner
          };
        });
      } catch (err) {
        console.error("recent matches failed for", e.key, err.message);
      }

      output.push({
        name: e.name,
        city: e.city,
        country: e.country,
        week: e.week,
        key: e.key,
        type,
        channel,
        link,
        rankings,
        fullRankings,
        recentMatches,
        nextMatch,
        isLive
      });
    }));

    output.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0));

    return new Response(JSON.stringify(output), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}