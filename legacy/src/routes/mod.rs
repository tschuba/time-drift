pub mod analytics;
pub mod dashboard;
pub mod day;
pub mod history;
pub mod month;

use axum::{routing::get, Router};
use sqlx::PgPool;

pub fn create_router() -> Router<PgPool> {
    Router::new()
        .route("/", get(dashboard::handler))
        .route("/month", get(month::handler))
        .route("/month/{ym}", get(month::handler))
        .route("/history", get(history::handler))
        .route("/analytics", get(analytics::handler))
        .merge(day::router())
}
