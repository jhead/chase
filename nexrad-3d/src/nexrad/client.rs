use chrono::{Datelike, Utc};
use reqwest::Client;

use crate::nexrad::types::RadarVolume;

const PROXY_BASE: &str = "https://nexrad.justindhead.workers.dev";
const BUCKET: &str = "unidata-nexrad-level2";

/// Returns `"YYYY/MM/DD"` for today in UTC — used as the S3 path prefix.
pub fn today_date_path() -> String {
    let now = Utc::now();
    format!("{}/{:02}/{:02}", now.year(), now.month(), now.day())
}

/// List `_V06` archive files for `site` on `date` (`"YYYY/MM/DD"`) via the
/// CF Worker S3 proxy, sorted newest-first.
pub async fn list_radar_files(site: &str, date: &str) -> Result<Vec<String>, String> {
    let client = Client::new();
    let url = format!(
        "{PROXY_BASE}/s3/{BUCKET}/?list-type=2&prefix={date}/{site}&max-keys=1000"
    );

    let xml = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("list request failed: {e}"))?
        .text()
        .await
        .map_err(|e| format!("list body read failed: {e}"))?;

    // Parse <Key>…</Key> entries from the S3 XML listing.
    let mut keys = Vec::new();
    let mut pos = 0;
    while let Some(start_offset) = xml[pos..].find("<Key>") {
        let start = pos + start_offset + 5;
        if let Some(end_offset) = xml[start..].find("</Key>") {
            keys.push(xml[start..start + end_offset].to_string());
            pos = start + end_offset + 6;
        } else {
            break;
        }
    }

    // Keep only super-resolution volume files and sort newest-first.
    let mut v06: Vec<String> = keys.into_iter().filter(|k| k.ends_with("_V06")).collect();
    v06.sort_by(|a, b| b.cmp(a));
    Ok(v06)
}

/// Download a single NEXRAD Level II archive file by its S3 key.
pub async fn fetch_radar_file(key: &str) -> Result<Vec<u8>, String> {
    let client = Client::new();
    let url = format!("{PROXY_BASE}/s3/{BUCKET}/{key}");

    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("fetch request failed: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("fetch body read failed: {e}"))?;

    Ok(bytes.to_vec())
}

/// High-level helper: list files for today, download the most recent one, and
/// parse it into a `RadarVolume`.
pub async fn fetch_latest_volume(site: &str) -> Result<RadarVolume, String> {
    let date = today_date_path();
    log::info!("listing {site} files for {date}");

    let keys = list_radar_files(site, &date).await?;
    let key = keys
        .into_iter()
        .next()
        .ok_or_else(|| format!("no _V06 files found for {site} on {date}"))?;

    log::info!("fetching {key}");
    let bytes = fetch_radar_file(&key).await?;

    log::info!("parsing {} bytes for {site}", bytes.len());
    super::parser::parse_volume(site, bytes)
}
