const API_KEY = "3akGADYYwdaFCipRCCWQssAgmzBHCxj6nxwwXYZdKyKRXfD3Qybq5kwfqs5GURgQ";
const BASE = "https://www.thebluealliance.com/api/v3";

async function tbaFetch(path) {
  const res = await fetch(BASE + path, { headers: { "X-TBA-Auth-Key": API_KEY } });
  if (!res.ok) throw new Error(`TBA ${path} → ${res.status}`);
  return res.json();
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtDate(epochSec) { return new Date(epochSec * 1000).toISOString().slice(0, 10); }

export default async function handler(req) {
  const url = new URL(req.url);
  const weekFilter = url.searchParams.get("week") ?? "all";

  try {
    const events = await tbaFetch("/events/2026");
    const today = todayStr();

    const candidates = events.filter(e => {
      if (weekFilter !== "all" && String(e.week) !== String(weekFilter)) return false;
      const isRegional = e.event_type === 0;
      const daysBack = isRegional ? 2 : 1;
      const end = new Date(e.end_date + "T00:00:00Z");
      const windowStart = new Date(end);
      windowStart.setDate(windowStart.getDate() - daysBack);
      const windowEnd = new Date(end);
      windowEnd.setDate(windowEnd.getDate() + 1);
      windowEnd.setHours(23, 59, 59, 999);
      const now = new Date();
      return now >= windowStart && now <= windowEnd;
    });

    const output = [];

    await Promise.all(candidates.map(async e => {
      let matches = [];
      try { matches = await tbaFetch(`/event/${e.key}/matches/simple`); }
      catch (err) { console.error("matches fetch failed for", e.key, err.message); }

      if (matches.length > 0) {
        const hasMatchToday = matches.some(m => m.time && fmtDate(m.time) === today);
        if (!hasMatchToday) return;
      }

      const nowSec = Date.now() / 1000;
      const todayMatches = matches.filter(m => m.time && fmtDate(m.time) === today);
      const sortedTimes = todayMatches.map(m => m.time).sort((a, b) => a - b);

      // Completed matches today = those with actual scores
      const completedToday = todayMatches.filter(m =>
        m.alliances && m.alliances.red.score !== null && m.alliances.red.score >= 0
      );
      const lastCompletedTime = completedToday.length
        ? Math.max(...completedToday.map(m => m.time))
        : null;

      // Upcoming = scheduled but not yet completed
      const upcoming = todayMatches
        .filter(m => !(m.alliances && m.alliances.red.score !== null && m.alliances.red.score >= 0))
        .sort((a, b) => a.time - b.time);

      const firstMatchTime = sortedTimes.length ? sortedTimes[0] : null;

      // isLive: ONLY true when matches have actually been scored today.
      // Never fires if no completed matches yet (e.g. 14 hours before start).
      let isLive = false;
      if (completedToday.length > 0) {
        const recentlyActive = lastCompletedTime && (nowSec - lastCompletedTime) < 90 * 60;
        const hasMoreMatches = upcoming.length > 0;
        isLive = recentlyActive || hasMoreMatches;
      }

      // Stream selection — pick stream based on window day index
      // When today's matches are all done (no upcoming), advance to next stream if available
      const streamOverrides = { "2026mimid": { type: "youtube", channel: "_oZuIOGYB_4" } };

      let type = "none";
      let link = "https://thebluealliance.com/event/" + e.key;
      let channel = "";
      const webcasts = (e.webcasts || []).filter(s => s.type === "youtube" || s.type === "twitch");

      if (streamOverrides[e.key]) {
        type = streamOverrides[e.key].type;
        channel = streamOverrides[e.key].channel;
        link = "https://youtube.com/watch?v=" + channel;
      } else if (webcasts.length > 0) {
        const isRegional = e.event_type === 0;
        const daysBack = isRegional ? 2 : 1;
        const windowStart = new Date(e.end_date + "T00:00:00Z");
        windowStart.setDate(windowStart.getDate() - daysBack);
        const msPerDay = 24 * 60 * 60 * 1000;
        let dayIndex = Math.round((new Date(today + "T00:00:00Z") - windowStart) / msPerDay);

        // If today's matches are fully done and there's a next-day stream, advance index
        // so the card shows tomorrow's stream (useful late at night after event wraps)
        // But only if we have more webcasts available
        const allDoneToday = completedToday.length > 0 && upcoming.length === 0
          && lastCompletedTime && (nowSec - lastCompletedTime) > 90 * 60;
        if (allDoneToday && dayIndex + 1 < webcasts.length) {
          dayIndex = dayIndex + 1;
        }

        const streamIndex = Math.min(Math.max(dayIndex, 0), webcasts.length - 1);
        const stream = webcasts[streamIndex];
        type = stream.type;
        channel = stream.channel;
        link = stream.type === "youtube"
          ? "https://youtube.com/watch?v=" + stream.channel
          : "https://twitch.tv/" + stream.channel;
      }

      const upcomingSchedule = upcoming.slice(0, 8).map(m => ({
        key: m.key.split("_")[1].toUpperCase(),
        time: m.time
      }));

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
      } catch (err) { console.error("rankings fetch failed for", e.key, err.message); }

      let recentMatches = [];
      try {
        const completed = matches
          .filter(m => m.alliances && m.alliances.red.score !== null && m.alliances.red.score >= 0)
          .sort((a, b) => (b.time || 0) - (a.time || 0))
          .slice(0, 10);
        recentMatches = completed.map(m => ({
          key: m.key.split("_")[1].toUpperCase(),
          redScore: m.alliances.red.score,
          blueScore: m.alliances.blue.score,
          redTeams: m.alliances.red.team_keys.map(t => t.replace("frc", "")),
          blueTeams: m.alliances.blue.team_keys.map(t => t.replace("frc", "")),
          winner: m.alliances.red.score > m.alliances.blue.score ? "red"
                : m.alliances.blue.score > m.alliances.red.score ? "blue" : "tie"
        }));
      } catch (err) { console.error("recent matches failed for", e.key, err.message); }

      const nextMatch = upcomingSchedule.length ? upcomingSchedule[0].key : "";
      const nextMatchTime = upcomingSchedule.length ? upcomingSchedule[0].time : null;

      output.push({
        name: e.name, city: e.city, country: e.country, week: e.week, key: e.key,
        type, channel, link, rankings, fullRankings, recentMatches,
        nextMatch, nextMatchTime, upcomingSchedule, isLive
      });
    }));

    output.sort((a, b) => {
      const tier = e => e.isLive ? 0 : e.upcomingSchedule?.length ? 1 : 2;
      return tier(a) - tier(b);
    });

    return new Response(JSON.stringify(output), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}