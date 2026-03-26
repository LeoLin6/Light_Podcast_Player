import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

const FEED_URL = "https://anchor.fm/s/104b7e58/podcast/rss";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outPath = path.join(rootDir, "feed.json");

function arrify(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function pickText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function pickGuid(item) {
  const guid = item?.guid;
  if (typeof guid === "string") return guid;
  if (guid && typeof guid === "object") return pickText(guid["#text"] || guid["text"]);
  return "";
}

function pickEnclosure(item) {
  const enc = item?.enclosure;
  if (!enc || typeof enc !== "object") return null;
  const url = pickText(enc["@_url"] || enc.url);
  if (!url) return null;
  return {
    url,
    length: pickText(enc["@_length"] || enc.length) || null,
    type: pickText(enc["@_type"] || enc.type) || null
  };
}

function pickDuration(item) {
  // itunes:duration often ends up as "itunes:duration" or "itunes_duration" depending on parser config.
  return (
    pickText(item?.["itunes:duration"]) ||
    pickText(item?.itunes_duration) ||
    pickText(item?.duration) ||
    ""
  );
}

async function main() {
  const res = await fetch(FEED_URL, {
    headers: {
      "user-agent": "podcast-light/1.0 (+github pages feed builder)"
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch RSS (${res.status})`);
  }
  const xml = await res.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    processEntities: false
  });
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;
  if (!channel) throw new Error("RSS parse error: missing channel");

  const title = pickText(channel.title) || "Podcast";
  const language = pickText(channel.language) || "en";
  const lastBuildDate = pickText(channel.lastBuildDate) || null;
  const itemsRaw = arrify(channel.item);

  const items = itemsRaw
    .map((it) => {
      const enclosure = pickEnclosure(it);
      return {
        guid: pickGuid(it) || (enclosure?.url ?? ""),
        title: pickText(it.title) || "",
        pubDate: pickText(it.pubDate) || "",
        duration: pickDuration(it) || null,
        enclosure
      };
    })
    .filter((it) => it.guid && it.enclosure?.url);

  const out = {
    feedUrl: FEED_URL,
    title,
    language,
    lastBuildDate,
    items
  };

  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  process.stdout.write(`Wrote ${items.length} episodes to ${path.relative(rootDir, outPath)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exitCode = 1;
});

