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
  return new Date().toISOString().slice(0, 10); // "yyyy-MM-dd" in UTC
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

    // Pass 1: window filter — within 2 days before end_date through 1 day after
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

    // Pass 2: confirm a match is actually today
    const output = [];

    await Promise.all(candidates.map(async e => {
      let matches = [];
      try {
        matches = await tbaFetch(`/event/${e.key}/matches/simple`);
      } catch (err) {
        console.error("matches fetch failed for", e.key, err.message);
      }

      if (matches.length > 0) {
        const hasMatchToday = matches.some(m => m.time && fmtDate(m.time) === today);
        if (!hasMatchToday) return;
      }

      // Stream info
      let type = "none";
      let link = "https://thebluealliance.com/event/" + e.key;
      let channel = "";
      const webcasts = e.webcasts || [];
      for (const stream of webcasts) {
        if (stream.type === "youtube") {
          type = "youtube";
          channel = stream.channel;
          link = "https://youtube.com/watch?v=" + stream.channel;
          break;
        } else if (stream.type === "twitch") {
          type = "twitch";
          channel = stream.channel;
          link = "https://twitch.tv/" + stream.channel;
          break;
        }
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

      // Top 5 rankings
      let rankings = [];
      try {
        const rankData = await tbaFetch(`/event/${e.key}/rankings`);
        if (rankData?.rankings) {
          rankings = rankData.rankings.slice(0, 5).map(r => ({
            rank: r.rank,
            team: r.team_key.replace("frc", ""),
            wins: r.record?.wins ?? 0,
            losses: r.record?.losses ?? 0,
            ties: r.record?.ties ?? 0
          }));
        }
      } catch (err) {
        console.error("rankings fetch failed for", e.key, err.message);
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
