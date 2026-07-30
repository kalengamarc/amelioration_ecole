use std::sync::PoisonError;
use serde_json::Value;
use thiserror::Error;
use crate::db::DbConn;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("{0}")]
    Database(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    AuthFailed(String),
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    Sync(String),
    #[error("{0}")]
    Internal(String),
    #[error("{0}")]
    BadRequest(String),
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self { AppError::Database(e.to_string()) }
}
impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self { AppError::Internal(e.to_string()) }
}
impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self { AppError::Sync(e.to_string()) }
}
impl<T> From<PoisonError<T>> for AppError {
    fn from(e: PoisonError<T>) -> Self { AppError::Internal(format!("Mutex poisoned: {}", e)) }
}

impl Into<tauri::ipc::InvokeError> for AppError {
    fn into(self) -> tauri::ipc::InvokeError {
        tauri::ipc::InvokeError::from(self.to_string())
    }
}

/// Build a JSON response matching the existing frontend API pattern.
pub fn api_response<T: serde::Serialize>(result: Result<T, AppError>) -> Value {
    match result {
        Ok(data) => serde_json::json!({ "success": true, "data": data }),
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

/// List response that puts items under a named key (e.g. "etablissements")
pub fn list_response<T: serde::Serialize>(key: &str, result: Result<Vec<T>, AppError>) -> Value {
    match result {
        Ok(items) => {
            let mut map = serde_json::Map::new();
            map.insert("success".into(), Value::Bool(true));
            map.insert(key.into(), serde_json::to_value(items).unwrap_or(Value::Array(vec![])));
            Value::Object(map)
        }
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}