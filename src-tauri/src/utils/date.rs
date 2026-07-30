use chrono::{NaiveDate, NaiveDateTime};

pub fn parse_date(s: &str) -> Option<NaiveDateTime> {
    // Try RFC3339 first
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&chrono::Utc).naive_utc());
    }
    // Try ISO date only
    if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return d.and_hms_opt(0, 0, 0);
    }
    // Try common formats
    for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y"] {
        if let Ok(dt) = NaiveDateTime::parse_from_str(s, fmt) {
            return Some(dt);
        }
    }
    None
}

pub fn to_iso(dt: &NaiveDateTime) -> String {
 dt.and_utc().to_rfc3339()
}