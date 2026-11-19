#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
struct LlmRequest {
    base_url: String,
    api_key: Option<String>,
    model: String,
    prompt: String,
}

// Native OpenAI-compatible chat call: no webview CORS, no Node-only deps.
#[tauri::command]
async fn llm_chat(req: LlmRequest) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut builder = client
        .post(format!(
            "{}/chat/completions",
            req.base_url.trim_end_matches('/')
        ))
        .json(&serde_json::json!({
            "model": req.model,
            "messages": [{ "role": "user", "content": req.prompt }],
            "stream": false,
        }));
    if let Some(key) = req.api_key {
        if !key.is_empty() {
            builder = builder.bearer_auth(key);
        }
    }
    let res = builder
        .send()
        .await
        .map_err(|e| format!("model request failed: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("model call failed: {}", res.status()));
    }
    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("bad model response: {e}"))?;
    body["choices"][0]["message"]["content"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| "model returned empty text".to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![llm_chat])
        .run(tauri::generate_context!())
        .expect("error while running Tivity");
}
