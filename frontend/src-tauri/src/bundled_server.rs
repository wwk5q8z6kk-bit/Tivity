use std::fs::{DirBuilder, OpenOptions};
use std::io;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

pub(crate) const REST_PORT: u16 = 9470;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(90);

pub(crate) struct Backend {
    child: Option<Child>,
    token: String,
}

impl Backend {
    pub(crate) fn start(default_profile: PathBuf) -> io::Result<Option<Self>> {
        let exe = std::env::current_exe()?;
        let Some(bin_dir) = exe.parent() else {
            return Ok(None);
        };
        // A dev binary uses the existing manually configured backend.
        if !bin_dir.ends_with("Contents/MacOS") {
            return Ok(None);
        }
        let binary = bin_dir.join("mv");
        if !binary.is_file() {
            return Err(io::Error::other(
                "The bundled server executable is missing.",
            ));
        }
        let runtime = bin_dir.join("../Frameworks/libonnxruntime.dylib");
        if !runtime.is_file() {
            return Err(io::Error::other("The bundled ONNX Runtime is missing."));
        }
        let runtime = runtime.canonicalize()?;
        // Never silently attach to a backend the app did not launch.
        drop(
            TcpListener::bind((Ipv4Addr::LOCALHOST, REST_PORT)).map_err(|_| {
                io::Error::other(
                    "Port 9470 is in use. Quit the other local server and reopen Tivity.",
                )
            })?,
        );

        let override_profile = std::env::var_os("TIVITY_DESKTOP_PROFILE_DIR").map(PathBuf::from);
        let isolated = override_profile.is_some();
        let profile = override_profile.unwrap_or(default_profile);
        if !profile.is_absolute() {
            return Err(io::Error::other(
                "The desktop profile path must be absolute.",
            ));
        }
        DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(&profile)?;
        let log_path = profile.join("server.log");
        let log = OpenOptions::new()
            .write(true)
            .truncate(true)
            .create(true)
            .mode(0o600)
            .open(&log_path)?;
        let random = Command::new("/usr/bin/openssl")
            .args(["rand", "-hex", "32"])
            .output()?;
        let token = String::from_utf8_lossy(&random.stdout).trim().to_owned();
        if !random.status.success()
            || token.len() != 64
            || !token.bytes().all(|c| c.is_ascii_hexdigit())
        {
            return Err(io::Error::other(
                "Could not create a local session credential.",
            ));
        }

        let mut command = Command::new(binary);
        for (key, _) in std::env::vars_os() {
            if key.to_string_lossy().starts_with("MINDVAULT_")
                && !(isolated && key == "MINDVAULT_JWT_SECRET")
            {
                command.env_remove(key);
            }
        }
        let child = command
            .current_dir(&profile)
            .arg("--config")
            .arg(profile.join("config.toml"))
            .args([
                "server",
                "start",
                "--foreground",
                "--port",
                "9470",
                "--grpc-port",
                "0",
            ])
            .env("MINDVAULT_BIND_HOST", "127.0.0.1")
            .env("MINDVAULT_DATA_DIR", profile.join("data"))
            .env("MINDVAULT_SOCKET_PATH", profile.join("api.sock"))
            .env("MINDVAULT_CORS_ALLOWED_ORIGINS", "tauri://localhost")
            .env("MINDVAULT_AUTH_TOKEN", &token)
            .env("MINDVAULT_AUTH_ROLE", "admin")
            .env("ORT_DYLIB_PATH", runtime)
            .stdin(Stdio::null())
            .stdout(Stdio::from(log.try_clone()?))
            .stderr(Stdio::from(log))
            .spawn()?;
        let mut backend = Self {
            child: Some(child),
            token,
        };
        let child = backend.child.as_mut().expect("child just spawned");
        let deadline = Instant::now() + STARTUP_TIMEOUT;
        loop {
            if child.try_wait()?.is_some() || Instant::now() >= deadline {
                return Err(io::Error::other(format!(
                    "See {} for details.",
                    log_path.display()
                )));
            }
            if TcpStream::connect_timeout(
                &(Ipv4Addr::LOCALHOST, REST_PORT).into(),
                Duration::from_millis(100),
            )
            .is_ok()
                && owns_listener(child.id())?
                && health_responds()
            {
                return Ok(Some(backend));
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    pub(crate) fn agent_session_token(&mut self) -> io::Result<String> {
        if let Some(child) = self.child.as_mut() {
            if child.try_wait()?.is_none() && owns_listener(child.id())? {
                return Ok(self.token.clone());
            }
        }
        Err(io::Error::other(
            "The bundled Tivity server is unavailable.",
        ))
    }

    pub(crate) fn fetch_bootstrap(&self) -> String {
        let credential = serde_json::to_string(&format!("Bearer {}", self.token))
            .expect("JSON serialization of a string");
        browser_bootstrap(&credential)
    }

    pub(crate) fn stop(&mut self) {
        let Some(mut child) = self.child.take() else {
            return;
        };
        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }
        // The server handles SIGINT with its normal shutdown path.
        let _ = Command::new("/bin/kill")
            .args(["-INT", &child.id().to_string()])
            .status();
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if matches!(child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn owns_listener(pid: u32) -> io::Result<bool> {
    Ok(Command::new("/usr/sbin/lsof")
        .args([
            "-a",
            "-p",
            &pid.to_string(),
            "-iTCP:9470",
            "-sTCP:LISTEN",
            "-t",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?
        .success())
}

fn health_responds() -> bool {
    let timeout = Duration::from_millis(200);
    let Ok(mut stream) =
        TcpStream::connect_timeout(&(Ipv4Addr::LOCALHOST, REST_PORT).into(), timeout)
    else {
        return false;
    };
    let mut status = [0; 12];
    stream.set_read_timeout(Some(timeout)).is_ok()
        && stream.set_write_timeout(Some(timeout)).is_ok()
        && stream
            .write_all(b"GET /api/v1/health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n")
            .is_ok()
        && stream.read_exact(&mut status).is_ok()
        && matches!(&status, b"HTTP/1.0 401" | b"HTTP/1.1 401")
}

impl Drop for Backend {
    fn drop(&mut self) {
        self.stop();
    }
}

pub(crate) const BLOCK_API: &str = r#"
(() => {
    if (location.protocol !== 'tauri:' || location.hostname !== 'localhost') return;
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        const target = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (target.origin === 'http://127.0.0.1:9470' || target.origin === 'http://localhost:9470') {
            return Promise.reject(new TypeError('The bundled Tivity server is unavailable'));
        }
        return fetch(input, init);
    };
})();
"#;

fn browser_bootstrap(credential_json: &str) -> String {
    // Keep the ephemeral credential in a closure; never persist it or attach
    // it to an external URL. User-supplied reviewer credentials take precedence.
    format!(
        r#"
(() => {{
    if (location.protocol !== 'tauri:' || location.hostname !== 'localhost') return;
    const fetch = window.fetch.bind(window);
    const authorization = {credential_json};
    window.fetch = (input, init) => {{
        const target = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (target.origin !== 'http://127.0.0.1:9470') return fetch(input, init);
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (headers.has('Authorization')) return fetch(input, init);
        headers.set('Authorization', authorization);
        return fetch(input, {{ ...init, headers, redirect: 'error' }});
    }};
}})();
"#
    )
}
