//! Authenticated notifications from the owned desktop sidecar. The browser
//! WebSocket API cannot set the bearer header required by `/ws/agent`.
use std::sync::Mutex;
use std::time::Duration;

use futures_util::StreamExt;
use tauri::{ipc::Channel, Manager, State, WebviewWindow};
use tokio_tungstenite::tungstenite::{
    client::IntoClientRequest, http::header, protocol::WebSocketConfig, Message,
};

use crate::bundled_server::{Backend, REST_PORT};

#[derive(Default)]
pub(crate) struct AgentStreams(Mutex<Option<(u32, tauri::async_runtime::JoinHandle<()>)>>);

fn require_main_window(window: &WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|err| err.to_string())?;
    if window.label() == "main" && url.scheme() == "tauri" && url.host_str() == Some("localhost") {
        Ok(())
    } else {
        Err("Agent notifications require the bundled Tivity window.".into())
    }
}

#[tauri::command]
pub(crate) async fn start_agent_stream(
    window: WebviewWindow,
    streams: State<'_, AgentStreams>,
    channel: Channel<Option<String>>,
) -> Result<(), String> {
    require_main_window(&window)?;
    let backend = window
        .try_state::<Mutex<Backend>>()
        .ok_or("No bundled server")?;
    let token = backend
        .lock()
        .map_err(|_| "Backend state unavailable")?
        .agent_session_token()
        .map_err(|err| err.to_string())?;
    let mut active = streams.0.lock().map_err(|_| "Stream state unavailable")?;
    if let Some((_, previous)) = active.take() {
        previous.abort();
    }
    let id = channel.id();
    let task = tauri::async_runtime::spawn(async move {
        forward_notifications(token, &channel).await;
        let _ = channel.send(None);
    });
    *active = Some((id, task));
    Ok(())
}

#[tauri::command]
pub(crate) fn stop_agent_stream(
    window: WebviewWindow,
    streams: State<'_, AgentStreams>,
    channel_id: u32,
) -> Result<(), String> {
    require_main_window(&window)?;
    let mut active = streams.0.lock().map_err(|_| "Stream state unavailable")?;
    if active.as_ref().is_some_and(|(id, _)| *id == channel_id) {
        if let Some((_, task)) = active.take() {
            task.abort();
        }
    }
    Ok(())
}

async fn forward_notifications(token: String, channel: &Channel<Option<String>>) {
    let Ok(mut request) = format!("ws://127.0.0.1:{REST_PORT}/ws/agent").into_client_request()
    else {
        return;
    };
    let Ok(mut authorization) = format!("Bearer {token}").parse::<header::HeaderValue>() else {
        return;
    };
    authorization.set_sensitive(true);
    request
        .headers_mut()
        .insert(header::AUTHORIZATION, authorization);
    let config = WebSocketConfig {
        max_message_size: Some(1024 * 1024),
        max_frame_size: Some(1024 * 1024),
        ..Default::default()
    };
    let connected = tokio::time::timeout(
        Duration::from_secs(5),
        tokio_tungstenite::connect_async_with_config(request, Some(config), true),
    )
    .await;
    let Ok(Ok((mut socket, _))) = connected else {
        return;
    };
    while let Some(Ok(message)) = socket.next().await {
        match message {
            Message::Text(text) => {
                if channel.send(Some(text)).is_err() {
                    break;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}
