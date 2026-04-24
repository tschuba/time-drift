pub mod dashboard;
pub mod day;
pub mod month;

use axum::{routing::get, Router};
use sqlx::PgPool;

pub fn create_router() -> Router<PgPool> {
    Router::new()
        .route("/", get(dashboard::handler))
        .route("/month", get(month::handler))
        .route("/month/{ym}", get(month::handler))
        .merge(day::router())
}
