#[cfg(target_os = "macos")]
mod agent_stream;
#[cfg(target_os = "macos")]
mod bundled_server;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder
        .manage(agent_stream::AgentStreams::default())
        .invoke_handler(tauri::generate_handler![
            agent_stream::start_agent_stream,
            agent_stream::stop_agent_stream
        ]);
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::{Manager, WebviewWindowBuilder};
                use tauri_plugin_dialog::DialogExt;

                let backend = bundled_server::Backend::start(app.path().app_data_dir()?);
                let window = &app.config().app.windows[0];
                let mut builder = WebviewWindowBuilder::from_config(app, window)?;
                match &backend {
                    Ok(Some(server)) => {
                        builder = builder.initialization_script(server.fetch_bootstrap());
                    }
                    Err(_) => {
                        builder = builder.initialization_script(bundled_server::BLOCK_API);
                    }
                    Ok(None) => {}
                }
                match backend {
                    Ok(Some(server)) => {
                        app.manage(std::sync::Mutex::new(server));
                    }
                    Err(err) => app
                        .dialog()
                        .message(format!("Tivity’s local server did not start. {err}"))
                        .title("Tivity")
                        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                        .show(|_| {}),
                    Ok(None) => {}
                }
                builder.build()?;
            };
            #[cfg(not(target_os = "macos"))]
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?.build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Tivity")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Exit = _event {
                use tauri::Manager;
                if let Some(server) = _app.try_state::<std::sync::Mutex<bundled_server::Backend>>()
                {
                    if let Ok(mut server) = server.lock() {
                        server.stop();
                    }
                }
            }
        });
}
