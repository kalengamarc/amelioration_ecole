/// Format BIF: "50 000 FBu", USD: "$1,234.56", CDF: "50 000 CDF"
pub fn format_money(amount: f64, devise: &str) -> String {
    match devise {
        "BIF" => {
            let whole = amount as i64;
            format!("{} FBu", fmt_fr(whole))
        }
        "CDF" => {
            let whole = amount as i64;
            format!("{} CDF", fmt_fr(whole))
        }
        "USD" | _ => {
            format!("${:.2}", amount)
        }
    }
}

fn fmt_fr(n: i64) -> String {
    let s = n.abs().to_string();
    let chars: Vec<char> = s.chars().collect();
    let mut parts = Vec::new();
    let mut i = chars.len() as i32;
    while i > 0 {
        let start = if i >= 3 { 0.max(i as usize - 3) } else { 0 };
        let chunk: String = chars[start..i as usize].iter().collect();
        parts.push(chunk);
        i -= 3;
    }
    parts.reverse();
    let joined = parts.join(" ");
    if n < 0 { format!("-{}", joined) } else { joined }
}